// ============================================================================
// Foot Stock Motor — SSE Endpoint /stream/market
// Subscreve no canal Redis market:tick e faz stream para o cliente.
// Migrado do Vercel (footstock-next) para o motor em 2026-05-06.
// Item 006: gate JWT + DELAY_BY_PLAN via PriceBuffer.
// ============================================================================

import type { IncomingMessage, ServerResponse } from 'http'
import { RedisClientService } from '../../services/RedisClientService'
import { REDIS_CHANNELS } from '../../types/events.types'
import { logger } from '../../utils/logger'
import { verifyJwt, JwtVerifyError, extractTokenFromRequest } from '../../lib/auth'
import { PriceBuffer } from '../../lib/PriceBuffer'
import { DELAY_BY_PLAN } from '../../constants/delays'
import type { MarketTickEvent } from '../../types/events.types'

const HEARTBEAT_INTERVAL_MS = 15_000

const ALLOWED_ORIGINS = [
  'https://footstock.com.br',
  'https://www.footstock.com.br',
  'https://stream.footstock.com.br',
  'https://app.footstock.com.br',
]

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  if (ALLOWED_ORIGINS.includes(origin)) return true
  if (origin.endsWith('.footstock.com.br')) return true
  return false
}

function setCorsHeaders(res: ServerResponse, origin: string | undefined): void {
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0]
  res.setHeader('Access-Control-Allow-Origin', allowOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export function handleMarketStream(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin

  if (req.method === 'OPTIONS') {
    setCorsHeaders(res, origin)
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'GET') {
    setCorsHeaders(res, origin)
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  // ─── Auth gate (item 006) ────────────────────────────────────────────────
  let payload: { planType: 'JOGADOR' | 'CRAQUE' | 'LENDA' }
  try {
    payload = verifyJwt(extractTokenFromRequest(req))
  } catch (e) {
    setCorsHeaders(res, origin)
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'unauthorized',
        code: e instanceof JwtVerifyError ? e.code : 'unknown',
      })
    )
    return
  }
  const delayMs = DELAY_BY_PLAN[payload.planType]
  // ──────────────────────────────────────────────────────────────────────────

  setCorsHeaders(res, origin)

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  }

  res.writeHead(200, headers)

  // Envia comment inicial para estabilizar conexão
  res.write(': connected\n\n')

  let closed = false
  let subscriber: ReturnType<typeof RedisClientService.createSubscriber> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  const priceBuffer = new PriceBuffer()

  function cleanup(): void {
    if (closed) return
    closed = true
    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }
    if (subscriber) {
      subscriber.unsubscribe(REDIS_CHANNELS.MARKET_TICK).catch(() => null)
      subscriber.quit().catch(() => null)
      subscriber = null
    }
    try { res.end() } catch { /* noop */ }
  }

  // Heartbeat a cada 15s para evitar timeout de proxy (Cloudflare etc.)
  heartbeat = setInterval(() => {
    if (closed) return
    try {
      res.write(': heartbeat\n\n')
    } catch {
      cleanup()
    }
  }, HEARTBEAT_INTERVAL_MS)

  // Cleanup quando cliente desconecta
  req.on('close', cleanup)
  req.on('error', cleanup)
  res.on('error', cleanup)

  try {
    subscriber = RedisClientService.createSubscriber()

    subscriber.on('error', (err: Error) => {
      logger.error('[marketStream] Redis subscriber error:', err.message)
      if (!closed) {
        try {
          res.write(`event: error\ndata: ${JSON.stringify({ code: 'STREAM_UNAVAILABLE', message: 'Serviço de streaming temporariamente indisponível.' })}\n\n`)
        } catch { /* noop */ }
        cleanup()
      }
    })

    subscriber.on('message', async (channel: string, message: string) => {
      if (channel !== REDIS_CHANNELS.MARKET_TICK || closed) return
      try {
        const event = JSON.parse(message) as MarketTickEvent
        if (!event.ticks || !Array.isArray(event.ticks)) {
          res.write(`data: ${message}\n\n`)
          return
        }

        // Push incoming ticks to buffer
        for (const tick of event.ticks) {
          await priceBuffer.push(tick.ticker, tick.price, tick.timestamp)
        }

        // Resolve delayed prices per plan
        const delayedTicks = []
        for (const tick of event.ticks) {
          const delayed = await priceBuffer.getDelayed(tick.ticker, delayMs)
          if (delayed) {
            delayedTicks.push({ ...tick, price: delayed.price, timestamp: delayed.timestamp })
          }
        }

        if (delayedTicks.length > 0) {
          const output = JSON.stringify({
            type: 'TICK',
            timestamp: Date.now(),
            ticks: delayedTicks,
          })
          res.write(`data: ${output}\n\n`)
        }
      } catch {
        if (!closed) {
          try {
            res.write(`data: ${message}\n\n`)
          } catch {
            cleanup()
          }
        }
      }
    })

    subscriber.subscribe(REDIS_CHANNELS.MARKET_TICK).catch((err: unknown) => {
      logger.error('[marketStream] Falha ao subscrever no Redis:', err instanceof Error ? err.message : err)
      if (!closed) {
        try {
          res.write(`event: error\ndata: ${JSON.stringify({ code: 'STREAM_UNAVAILABLE', message: 'Serviço de streaming indisponível.' })}\n\n`)
        } catch { /* noop */ }
        cleanup()
      }
    })
  } catch (err) {
    logger.error('[marketStream] Erro ao inicializar subscriber:', err instanceof Error ? err.message : err)
    cleanup()
  }
}
