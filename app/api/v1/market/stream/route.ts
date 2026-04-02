// ============================================================================
// Foot Stock — SSE Endpoint /api/v1/market/stream
// Subscreve no canal Redis market:tick e faz stream para o cliente.
// Plano JOGADOR recebe preços com delay de 1h.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createSubscriber, REDIS_CHANNELS } from '@/lib/redis'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { DELAY_BY_PLAN } from '@/lib/constants/limits'

// Timeout de inatividade (Vercel tem limite de 60s para streaming)
const SSE_KEEPALIVE_MS = 25_000

async function streamHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const planType = user.planType as keyof typeof DELAY_BY_PLAN
  const delayMs = DELAY_BY_PLAN[planType] ?? 0
  const isDelayed = delayMs > 0

  // Fila de delay para plano JOGADOR (buffer de 1h de ticks)
  const tickBuffer: { data: string; scheduledAt: number }[] = []

  let subscriber: ReturnType<typeof createSubscriber> | null = null
  let keepalive: ReturnType<typeof setInterval> | null = null
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      subscriber = createSubscriber()

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

      subscriber.on('message', (channel, message) => {
        if (channel !== REDIS_CHANNELS.MARKET_TICK || closed) return

        // Inject delayed metadata into the SSE payload
        let enrichedMessage = message
        try {
          const parsed = JSON.parse(message)
          parsed.delayed = isDelayed
          parsed.delayMs = delayMs
          enrichedMessage = JSON.stringify(parsed)
        } catch {
          // Keep original message if parse fails
        }

        const sseData = `data: ${enrichedMessage}\n\n`

        if (isDelayed) {
          // Enfileirar com timestamp para despacho após delay do plano
          tickBuffer.push({ data: sseData, scheduledAt: Date.now() + delayMs })
          // Verificar e despachar ticks atrasados
          const now = Date.now()
          const toSend = tickBuffer.filter(t => t.scheduledAt <= now)
          toSend.forEach(t => {
            try {
              controller.enqueue(encoder.encode(t.data))
            } catch {
              closed = true
            }
          })
          tickBuffer.splice(0, toSend.length)
        } else {
          try {
            controller.enqueue(encoder.encode(sseData))
          } catch {
            closed = true
          }
        }
      })

      await subscriber.subscribe(REDIS_CHANNELS.MARKET_TICK)

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

const encoder = new TextEncoder()

export const GET = withAuth(streamHandler)
