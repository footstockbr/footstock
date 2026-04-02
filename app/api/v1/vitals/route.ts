// ============================================================================
// Foot Stock — POST /api/v1/vitals
// Recebe Core Web Vitals do cliente via navigator.sendBeacon (fire-and-forget).
// Armazena contadores agregados no Redis com TTL de 7 dias.
// Sem autenticação — endpoint de analytics público (dados não são PII).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { redisPublisher as redis } from '@/lib/redis'

const VITALS_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 dias

const vitalSchema = z.object({
  name: z.enum(['CLS', 'LCP', 'INP', 'FCP', 'TTFB']),
  value: z.number().finite(),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  id: z.string().max(64),
  delta: z.number().finite().optional(),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown

  // sendBeacon pode enviar como text/plain ou application/json
  try {
    const text = await req.text()
    body = JSON.parse(text)
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Payload inválido.' } },
      { status: 400 }
    )
  }

  const parsed = vitalSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_002', message: 'Métrica inválida.' } },
      { status: 400 }
    )
  }

  const { name, value, rating } = parsed.data

  try {
    // Contadores agregados por métrica+rating
    // Chave: vitals:{name}:{rating}  → INCR
    // Chave: vitals:{name}:sum       → INCRBYFLOAT (para calcular média)
    const counterKey = `vitals:${name}:${rating}`
    const sumKey = `vitals:${name}:sum`
    const countKey = `vitals:${name}:count`

    const pipeline = redis.pipeline()
    pipeline.incr(counterKey)
    pipeline.expire(counterKey, VITALS_TTL_SECONDS)
    pipeline.incrbyfloat(sumKey, value)
    pipeline.expire(sumKey, VITALS_TTL_SECONDS)
    pipeline.incr(countKey)
    pipeline.expire(countKey, VITALS_TTL_SECONDS)
    await pipeline.exec()
  } catch {
    // Redis indisponível — não bloquear o cliente (fire-and-forget)
    if (process.env.NODE_ENV === 'development') {
      console.warn('[vitals] Redis indisponível — métrica descartada:', parsed.data)
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[vitals] ${name}=${value.toFixed(2)} rating=${rating}`)
  }

  // 204: sendBeacon não lê a resposta
  return new NextResponse(null, { status: 204 })
}
