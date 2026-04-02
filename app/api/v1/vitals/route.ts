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

const TRACKED_METRICS = ['CLS', 'LCP', 'INP', 'FCP', 'TTFB'] as const
type TrackedMetric = (typeof TRACKED_METRICS)[number]

const vitalSchema = z.object({
  // next/web-vitals também emite métricas internas do Next.js (ex: Next.js-hydration).
  // Aceitamos qualquer string — filtramos apenas as métricas conhecidas antes de persistir.
  name: z.string().max(64),
  value: z.number(),
  rating: z.enum(['good', 'needs-improvement', 'poor']).optional(),
  id: z.string().max(64),
  delta: z.number().optional(),
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

  // Métricas customizadas do Next.js (ex: Next.js-hydration) não são rastreadas — descartar silenciosamente.
  if (!TRACKED_METRICS.includes(name as TrackedMetric)) {
    return new NextResponse(null, { status: 204 })
  }

  const trackedName = name as TrackedMetric
  const trackedRating = rating ?? 'good'

  try {
    // Contadores agregados por métrica+rating
    // Chave: vitals:{name}:{rating}  → INCR
    // Chave: vitals:{name}:sum       → INCRBYFLOAT (para calcular média)
    const counterKey = `vitals:${trackedName}:${trackedRating}`
    const sumKey = `vitals:${trackedName}:sum`
    const countKey = `vitals:${trackedName}:count`

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
    console.log(`[vitals] ${trackedName}=${value.toFixed(2)} rating=${trackedRating}`)
  }

  // 204: sendBeacon não lê a resposta
  return new NextResponse(null, { status: 204 })
}
