import http from 'http'
import request from 'supertest'
import { EventEmitter } from 'events'
import jwt from 'jsonwebtoken'
import { handleMarketStream } from '../marketStream'
import { RedisClientService } from '../../../services/RedisClientService'
import { PriceBuffer } from '../../../lib/PriceBuffer'
import type Redis from 'ioredis'

jest.mock('../../../services/RedisClientService')

// Factory cria o mock redis e o exporta — sem TDZ
jest.mock('../../../lib/redis', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RedisMock = require('ioredis-mock')
  const instance = new RedisMock()
  return { redis: instance, __test_redis: instance }
})

const SECRET = 'test-secret'

function createFakeSubscriber() {
  const sub = new EventEmitter() as any
  sub.subscribe = jest.fn().mockResolvedValue(undefined)
  sub.unsubscribe = jest.fn().mockResolvedValue(undefined)
  sub.quit = jest.fn().mockResolvedValue(undefined)
  return sub
}

describe('marketStream auth gate + delay', () => {
  let app: http.Server
  let fakeSubscriber: ReturnType<typeof createFakeSubscriber>
  let buffer: PriceBuffer
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mockRedis = require('../../../lib/redis').__test_redis as Redis

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET
    app = http.createServer((req, res) => handleMarketStream(req, res))
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve))
  })

  afterAll(() => new Promise<void>((resolve) => app.close(() => resolve())))

  beforeEach(async () => {
    fakeSubscriber = createFakeSubscriber()
    ;(RedisClientService.createSubscriber as jest.Mock).mockReturnValue(fakeSubscriber)
    buffer = new PriceBuffer(mockRedis)
    await (mockRedis as any).flushall()
  })

  function makeToken(planType: string, overrides?: object) {
    return jwt.sign({ sub: 'u1', planType, ...overrides }, SECRET)
  }

  function requestStream(token?: string) {
    const req = request(app)
      .get('/stream/market')
      .set('Accept', 'text/event-stream')
    if (token) req.set('Authorization', `Bearer ${token}`)
    return req
  }

  // ─── Auth gate (resposta HTTP imediata — sem SSE keepalive) ─────────────

  test('sem token -> 401 code: no_token', async () => {
    const res = await requestStream()
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized', code: 'no_token' })
  })

  test('token expired -> 401 code: expired', async () => {
    const token = jwt.sign({ sub: 'u1', planType: 'CRAQUE', exp: 1 }, SECRET)
    const res = await requestStream(token)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized', code: 'expired' })
  })

  test('token invalid sig -> 401 code: invalid_sig', async () => {
    const token = jwt.sign({ sub: 'u1', planType: 'CRAQUE' }, 'wrong-secret')
    const res = await requestStream(token)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'unauthorized', code: 'invalid_sig' })
  })

  // ─── SSE streaming (conexão http raw para manter keepalive) ─────────────

  function openSseStream(token: string, port: number, tickDelay = 0): Promise<{ statusCode: number; headers: Record<string, any>; data: string }> {
    return new Promise((resolve, reject) => {
      let data = ''
      const req = http.request(
        {
          hostname: '127.0.0.1', port,
          path: '/stream/market',
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        },
        (res) => {
          const { statusCode = 0, headers } = res
          res.setEncoding('utf8')
          res.on('data', (chunk: string) => { data += chunk })
          res.on('error', (e: any) => { if (e.code !== 'ECONNRESET') reject(e) })

          if (tickDelay > 0) {
            setTimeout(() => {
              fakeSubscriber.emit('message', 'market:tick', JSON.stringify({
                type: 'TICK', timestamp: Date.now(),
                ticks: [{ assetId: 'a1', ticker: 'PETR4', price: 29.0, sessionType: 'TRADING', timestamp: Date.now(), open: 28, high: 29, low: 27, close: 27.5, volume: 1000, change: 1, changePercent: 3.5 }],
              }))
            }, tickDelay)
          }

          setTimeout(() => {
            req.destroy()
            resolve({ statusCode, headers: headers as any, data })
          }, 350)
        }
      )
      req.on('error', (e: any) => { if (e.code !== 'ECONNRESET') reject(e) })
      req.end()
    })
  }

  function makeSnapshot(price: number, timestamp: number) {
    return {
      assetId: 'a1',
      ticker: 'PETR4',
      price,
      open: price - 0.5,
      high: price + 0.5,
      low: price - 1,
      close: price - 0.2,
      volume: 1000,
      change: 0.2,
      changePercent: 0.7,
      sessionType: 'TRADING' as const,
      timestamp,
      ofi: 0.05,
      bookPressure: 12000,
      pendingBuyVolume: 5000,
      pendingSellVolume: 7000,
    }
  }

  function parsePayloadLines(data: string): { type: string; ticks: Record<string, unknown>[] }[] {
    return data
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => {
        try {
          return JSON.parse(l.replace('data: ', ''))
        } catch {
          return null
        }
      })
      .filter(Boolean) as { type: string; ticks: Record<string, unknown>[] }[]
  }

  test('Plano JOGADOR: delay > 0 — 200 + tick DELAYED com metadados', async () => {
    const now = Date.now()
    await buffer.push('PETR4', makeSnapshot(28.5, now - 3_600_000))

    const port = (app.address() as any).port
    const { statusCode, headers, data } = await openSseStream(makeToken('JOGADOR'), port, 80)

    expect(statusCode).toBe(200)
    expect(headers['content-type']).toMatch(/text\/event-stream/)
    expect(data).toContain(': connected')

    const payloads = parsePayloadLines(data)
    const tickPayloads = payloads.filter((p) => p.type === 'TICK' && p.ticks?.length > 0)
    expect(tickPayloads.length).toBeGreaterThan(0)
    for (const payload of tickPayloads) {
      for (const tick of payload.ticks) {
        expect(tick).toMatchObject({
          ticker: 'PETR4',
          state: 'DELAYED',
          delayed: true,
          delayMs: 3_600_000,
          bufferVersion: 2,
        })
        expect(tick.timestamp).toBeLessThanOrEqual(now - 3_600_000)
        expect(tick.snapshotAgeMs).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('Plano LENDA: delay 0 — 200 + tick LIVE com metadados', async () => {
    const now = Date.now()
    await buffer.push('PETR4', makeSnapshot(29.0, now))

    const port = (app.address() as any).port
    const { statusCode, headers, data } = await openSseStream(makeToken('LENDA'), port, 80)

    expect(statusCode).toBe(200)
    expect(headers['content-type']).toMatch(/text\/event-stream/)
    expect(data).toContain(': connected')

    const payloads = parsePayloadLines(data)
    const tickPayloads = payloads.filter((p) => p.type === 'TICK' && p.ticks?.length > 0)
    expect(tickPayloads.length).toBeGreaterThan(0)
    for (const payload of tickPayloads) {
      for (const tick of payload.ticks) {
        expect(tick).toMatchObject({
          ticker: 'PETR4',
          state: 'LIVE',
          delayed: false,
          delayMs: 0,
          bufferVersion: 2,
        })
      }
    }
  })

  // ─── Gate P0: retransmissão de payload bruto ──────────────────────────────
  // Estes testes afirmam que o SSE NÃO retransmite mensagens cruas em caminhos
  // de falha.

  function openSseAndSend(
    token: string,
    port: number,
    rawMessage: string,
    delayBeforeSend: number,
  ): Promise<{ data: string }> {
    return new Promise((resolve, reject) => {
      let data = ''
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/stream/market',
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        },
        (res) => {
          res.setEncoding('utf8')
          res.on('data', (chunk: string) => { data += chunk })
          res.on('error', (e: any) => { if (e.code !== 'ECONNRESET') reject(e) })

          setTimeout(() => {
            fakeSubscriber.emit('message', 'market:tick', rawMessage)
          }, delayBeforeSend)

          setTimeout(() => {
            req.destroy()
            resolve({ data })
          }, delayBeforeSend + 300)
        },
      )
      req.on('error', (e: any) => { if (e.code !== 'ECONNRESET') reject(e) })
      req.end()
    })
  }

  describe('Gate P0: sem retransmissão de payload bruto', () => {
    test('evento sem ticks NÃO deve retransmitir mensagem bruta para JOGADOR', async () => {
      const port = (app.address() as any).port
      const rawMessage = JSON.stringify({ type: 'TICK', timestamp: Date.now(), ticks: [] })

      const { data } = await openSseAndSend(makeToken('JOGADOR'), port, rawMessage, 80)

      const dataLines = data.split('\n').filter((l) => l.startsWith('data:'))
      const payloadLines = dataLines.filter((l) => {
        try { return JSON.parse(l.replace('data: ', '')) } catch { return false }
      })

      for (const line of payloadLines) {
        const payload = JSON.parse(line.replace('data: ', ''))
        if (payload.type === 'TICK') {
          expect(payload.ticks).toBeDefined()
          expect(payload.ticks.length).toBe(0)
        }
      }
    })

    test('evento sem array ticks NÃO deve retransmitir mensagem bruta', async () => {
      const port = (app.address() as any).port
      const rawMessage = JSON.stringify({ type: 'TICK', timestamp: Date.now() })

      const { data } = await openSseAndSend(makeToken('JOGADOR'), port, rawMessage, 80)

      const dataLines = data.split('\n').filter((l) => l.startsWith('data:'))
      for (const line of dataLines) {
        const raw = line.replace('data: ', '').trim()
        if (!raw || raw.startsWith(':')) continue
        try {
          const payload = JSON.parse(raw)
          if (payload.type === 'TICK') {
            expect(payload.ticks).toBeDefined()
            expect(Array.isArray(payload.ticks)).toBe(true)
          }
        } catch {
          // Se não é JSON parseável, não deve estar no stream
          throw new Error('Mensagem bruta não-JSON retransmitida no SSE')
        }
      }
    })

    test('payload JSON inválido NÃO deve ser retransmitido', async () => {
      const port = (app.address() as any).port
      const invalidJson = '{broken json'

      const { data } = await openSseAndSend(makeToken('JOGADOR'), port, invalidJson, 80)

      expect(data).not.toContain('{broken json')
    })

    test('tick atrasado de JOGADOR deve ter timestamp <= cutoff (now - 1h)', async () => {
      const now = Date.now()
      const recentTick = {
        assetId: 'a1',
        ticker: 'PETR4',
        price: 30.0,
        sessionType: 'TRADING',
        timestamp: now,
        open: 28,
        high: 31,
        low: 27,
        close: 29,
        volume: 1000,
        change: 2,
        changePercent: 7.1,
      }

      await buffer.push('PETR4', makeSnapshot(28.5, now - 3_600_000))

      const port = (app.address() as any).port
      const { data } = await openSseAndSend(
        makeToken('JOGADOR'),
        port,
        JSON.stringify({ type: 'TICK', timestamp: now, ticks: [recentTick] }),
        80,
      )

      const dataLines = data.split('\n').filter((l) => l.startsWith('data:'))
      for (const line of dataLines) {
        const raw = line.replace('data: ', '').trim()
        if (!raw || raw.startsWith(':')) continue
        try {
          const payload = JSON.parse(raw)
          if (payload.type === 'TICK' && payload.ticks?.length > 0) {
            for (const tick of payload.ticks) {
              const cutoff = now - 3_600_000
              expect(tick.timestamp).toBeLessThanOrEqual(cutoff)
            }
          }
        } catch {
          // ignore non-JSON lines (heartbeats, comments)
        }
      }
    })

    test('buffer frio de JOGADOR emite BUFFERING sem preço', async () => {
      const now = Date.now()
      const recentTick = {
        assetId: 'a1',
        ticker: 'PETR4',
        price: 30.0,
        sessionType: 'TRADING' as const,
        timestamp: now,
        open: 28,
        high: 31,
        low: 27,
        close: 29,
        volume: 1000,
        change: 2,
        changePercent: 7.1,
      }

      const port = (app.address() as any).port
      const { data } = await openSseAndSend(
        makeToken('JOGADOR'),
        port,
        JSON.stringify({ type: 'TICK', timestamp: now, ticks: [recentTick] }),
        80,
      )

      const payloads = parsePayloadLines(data)
      const tickPayloads = payloads.filter((p) => p.type === 'TICK' && p.ticks?.length > 0)
      expect(tickPayloads.length).toBeGreaterThan(0)
      for (const payload of tickPayloads) {
        for (const tick of payload.ticks) {
          expect(tick).toMatchObject({
            ticker: 'PETR4',
            state: 'BUFFERING',
            delayed: true,
            delayMs: 3_600_000,
            price: null,
            changePercent: null,
            timestamp: null,
            bufferVersion: 2,
          })
        }
      }
    })
  })
})
