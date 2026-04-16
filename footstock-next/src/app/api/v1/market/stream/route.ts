// ============================================================================
// FootStock — SSE Endpoint /api/v1/market/stream (T-022)
// Subscreve no canal Redis market:tick e faz stream para o cliente.
//
// Delay server-side por plano (nunca bypassável pelo cliente):
//   - LENDA: tempo real (delay 0)
//   - CRAQUE: 30 minutos de atraso
//   - JOGADOR: 60 minutos de atraso
//
// O delay é aplicado via PriceBuffer (Redis ZSET centralizado), eliminando
// a vulnerabilidade do buffer in-memory por conexão que existia anteriormente.
// Se o buffer ainda não tiver dados suficientes (warmup), envia evento
// "buffering" em vez de preço atual — nunca vaza dados de plano superior.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createSubscriber, REDIS_CHANNELS } from '@/lib/redis'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { DELAY_BY_PLAN } from '@/lib/constants/limits'
import { PriceBuffer } from '@/lib/services/PriceBuffer'

// RESOLVED: T001 — maxDuration sobrepõe vercel.json (15s → 60s) para SSE streaming
export const maxDuration = 60

// Timeout de inatividade (Vercel tem limite de 60s para streaming)
const SSE_KEEPALIVE_MS = 25_000

const encoder = new TextEncoder()

interface RawMotorTick {
  ticker: string
  price: number
  changePercent?: number
  timestamp: number
  isHalted?: boolean
  haltReason?: string | null
  estimatedResume?: number | null
}

interface TickPayload {
  type: string
  ticks: RawMotorTick[]
}

async function streamHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const planType = user.planType as keyof typeof DELAY_BY_PLAN
  const delayMs = DELAY_BY_PLAN[planType] ?? DELAY_BY_PLAN.JOGADOR
  const isDelayed = delayMs > 0

  let subscriber: ReturnType<typeof createSubscriber> | null = null
  let keepalive: ReturnType<typeof setInterval> | null = null
  let closed = false

  // Processa um tick do canal market:tick e envia ao cliente via SSE.
  // Handler isolado para evitar unhandled rejections no event emitter.
  async function processTickMessage(
    message: string,
    ctrl: ReadableStreamDefaultController
  ): Promise<void> {
    if (closed) return

    let payload: TickPayload | null = null
    try {
      payload = JSON.parse(message) as TickPayload
    } catch {
      return // mensagem malformada — ignora
    }

    if (payload.type !== 'TICK' || !Array.isArray(payload.ticks)) return

    // Ingere ticks no buffer Redis (atômico, idempotente via ZSET)
    // Múltiplas conexões ingerindo o mesmo tick = no-op
    await Promise.all(
      payload.ticks.map((t) => PriceBuffer.ingest(t.ticker, t.price, t.timestamp))
    )

    if (!isDelayed) {
      // Plano LENDA: encaminha tick atual com metadata de delay=0
      let enrichedMessage = message
      try {
        const parsed = JSON.parse(message) as Record<string, unknown>
        parsed.delayed = false
        parsed.delayMs = 0
        enrichedMessage = JSON.stringify(parsed)
      } catch { /* mantém mensagem original */ }

      if (!closed) {
        try {
          ctrl.enqueue(encoder.encode(`data: ${enrichedMessage}\n\n`))
        } catch { closed = true }
      }
      return
    }

    // Plano com delay: busca preços do passado via PriceBuffer
    const delayedTicks = await Promise.all(
      payload.ticks.map(async (t) => {
        const delayedPrice = await PriceBuffer.getDelayed(t.ticker, delayMs)
        return { tick: t, delayedPrice }
      })
    )

    const hasDelayedData = delayedTicks.some(({ delayedPrice }) => delayedPrice !== null)

    if (!hasDelayedData) {
      // Buffer ainda aquecendo — sinaliza ao cliente sem vazar preço real
      if (!closed) {
        try {
          ctrl.enqueue(encoder.encode(
            `event: buffering\ndata: ${JSON.stringify({
              type: 'BUFFERING',
              message: 'Aguardando dados com atraso disponíveis',
              delayMs,
            })}\n\n`
          ))
        } catch { closed = true }
      }
      return
    }

    // Monta payload com preços atrasados (omite tickers sem dado disponível ainda)
    const eligibleTicks = delayedTicks
      .filter(({ delayedPrice }) => delayedPrice !== null)
      .map(({ tick, delayedPrice }) => ({
        ...tick,
        price: delayedPrice as number,
        delayed: true,
        delayMs,
      }))

    if (!closed) {
      try {
        ctrl.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: 'TICK', ticks: eligibleTicks, delayed: true, delayMs })}\n\n`
        ))
      } catch { closed = true }
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      subscriber = createSubscriber()
      if (!subscriber) {
        controller.close()
        return
      }

      // Propaga erros Redis como evento SSE de erro
      subscriber.on('error', (err: Error) => {
        console.error('[stream] Redis subscriber error:', err.message)
        if (!closed) {
          closed = true
          if (keepalive) { clearInterval(keepalive); keepalive = null }
          try {
            controller.enqueue(encoder.encode(
              `event: error\ndata: ${JSON.stringify({ code: 'STREAM_UNAVAILABLE', message: 'Serviço de streaming temporariamente indisponível.' })}\n\n`
            ))
          } catch { /* stream já fechado */ }
          try { controller.close() } catch { /* já fechado */ }
        }
      })

      // Heartbeat SSE para manter conexão viva
      keepalive = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          closed = true
          if (keepalive) { clearInterval(keepalive); keepalive = null }
        }
      }, SSE_KEEPALIVE_MS)

      subscriber.on('message', (channel: string, message: string) => {
        if (channel !== REDIS_CHANNELS.MARKET_TICK || closed) return
        // Processar de forma assíncrona sem bloquear o event emitter
        void processTickMessage(message, controller).catch((err: unknown) => {
          console.error('[stream] processTickMessage error:', err instanceof Error ? err.message : err)
        })
      })

      try {
        await subscriber.subscribe(REDIS_CHANNELS.MARKET_TICK)
      } catch (err) {
        console.error('[stream] Falha ao subscrever no Redis:', err instanceof Error ? err.message : err)
        closed = true
        if (keepalive) { clearInterval(keepalive); keepalive = null }
        try {
          controller.enqueue(encoder.encode(
            `event: error\ndata: ${JSON.stringify({ code: 'STREAM_UNAVAILABLE', message: 'Serviço de streaming indisponível.' })}\n\n`
          ))
        } catch { /* noop */ }
        controller.close()
        return
      }

      // Cleanup ao fechar conexão
      req.signal.addEventListener('abort', () => {
        closed = true
        if (keepalive) { clearInterval(keepalive); keepalive = null }
        subscriber?.unsubscribe(REDIS_CHANNELS.MARKET_TICK).catch(() => null)
        subscriber?.quit().catch(() => null)
        controller.close()
      })
    },

    cancel() {
      closed = true
      if (keepalive) { clearInterval(keepalive); keepalive = null }
      subscriber?.unsubscribe(REDIS_CHANNELS.MARKET_TICK).catch(() => null)
      subscriber?.quit().catch(() => null)
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
      ...(isDelayed ? { 'X-Price-Delay': String(delayMs / 1000) } : {}),
    },
  })
}

export const GET = withAuth(streamHandler)
