// ============================================================================
// Foot Stock — SSE Endpoint /api/v1/news/stream (Should)
// Subscreve o canal Redis news:inject e faz stream para o cliente.
// ============================================================================

import { NextRequest } from 'next/server'
import { createSubscriber } from '@/lib/redis'
import { withAuth, type AuthContext } from '@/app/api/middleware'

const KEEPALIVE_MS = 25_000
const REDIS_CHANNEL = 'news:inject'

async function newsStreamHandler(req: NextRequest, _ctx: AuthContext): Promise<Response> {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let subscriber: ReturnType<typeof createSubscriber> | null = null

      try {
        subscriber = createSubscriber()
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
        controller.close()
        return
      }

      // Heartbeat a cada 25s para manter conexão viva em proxies
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(keepalive)
        }
      }, KEEPALIVE_MS)

      req.signal.addEventListener('abort', () => {
        clearInterval(keepalive)
        if (subscriber) {
          try { subscriber.unsubscribe(REDIS_CHANNEL) } catch { /* ignore */ }
          try { subscriber.disconnect() } catch { /* ignore */ }
        }
        try {
          controller.close()
        } catch {
          // já fechado
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

export const GET = withAuth(newsStreamHandler as never)
