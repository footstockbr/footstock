// ============================================================================
// FootStock — SSE Endpoint /api/v1/news/stream (Should)
// Subscreve o canal Redis news:inject e faz stream para o cliente.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createSubscriber } from '@/lib/redis'
import { withAuth, type AuthContext } from '@/app/api/middleware'

export const maxDuration = 60

const KEEPALIVE_MS = 25_000
const REDIS_CHANNEL = 'news:inject'

async function newsStreamHandler(req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  const encoder = new TextEncoder()

  let subscriber: ReturnType<typeof createSubscriber> | null = null
  let keepalive: ReturnType<typeof setInterval> | null = null

  function cleanup() {
    if (keepalive) { clearInterval(keepalive); keepalive = null }
    if (subscriber) {
      try { subscriber.unsubscribe(REDIS_CHANNEL) } catch { /* ignore */ }
      try { subscriber.disconnect() } catch { /* ignore */ }
      subscriber = null
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        subscriber = createSubscriber()
        if (!subscriber) {
          controller.close()
          return
        }

        subscriber.on('error', (err: Error) => {
          console.error('[news:stream] Erro Redis:', err)
          try { controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: 'Redis connection error' })}\n\n`)) } catch { /* ignore */ }
          cleanup()
          try { controller.close() } catch { /* já fechado */ }
        })

        await subscriber.subscribe(REDIS_CHANNEL)

        subscriber.on('message', (_channel: string, message: string) => {
          try {
            controller.enqueue(encoder.encode(`data: ${message}\n\n`))
          } catch {
            // Controller fechado
          }
        })
      } catch (err) {
        console.error('[news:stream] Erro ao conectar Redis:', err)
        try { controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: 'Stream unavailable' })}\n\n`)) } catch { /* ignore */ }
        cleanup()
        controller.close()
        return
      }

      // Heartbeat a cada 25s para manter conexão viva em proxies
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          cleanup()
        }
      }, KEEPALIVE_MS)

      req.signal.addEventListener('abort', () => {
        cleanup()
        try { controller.close() } catch { /* já fechado */ }
      })
    },

    cancel() {
      cleanup()
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

export const GET = withAuth(newsStreamHandler)
