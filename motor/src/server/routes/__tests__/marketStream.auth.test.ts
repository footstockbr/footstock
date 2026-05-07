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

  test('Plano JOGADOR: delay > 0 — 200 + SSE headers', async () => {
    const now = Date.now()
    await buffer.push('PETR4', 28.5, now - 3_600_000)

    const port = (app.address() as any).port
    const { statusCode, headers, data } = await openSseStream(makeToken('JOGADOR'), port)

    expect(statusCode).toBe(200)
    expect(headers['content-type']).toMatch(/text\/event-stream/)
    expect(data).toContain(': connected')
  })

  test('Plano LENDA: delay 0 — 200 + latest tick emitido', async () => {
    const now = Date.now()
    await buffer.push('PETR4', 29.0, now)

    const port = (app.address() as any).port
    const { statusCode, headers, data } = await openSseStream(makeToken('LENDA'), port, 80)

    expect(statusCode).toBe(200)
    expect(headers['content-type']).toMatch(/text\/event-stream/)
    expect(data).toContain(': connected')
    expect(data).toContain('data:')
    expect(data).toContain('PETR4')
  })
})
