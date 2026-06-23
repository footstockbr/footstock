// ============================================================================
// FootStock — Paid Feature Grace Usage Counter (FIX-09)
// ----------------------------------------------------------------------------
// Instrumenta o uso de uma feature paga quando a assinatura JA EXPIROU mas ainda
// esta dentro da graca de 7 dias (ver shouldSuspendAccount em plan-logic.ts).
//
// DECISAO 2026-06-22 (loop 06-22-footstock-financeiro-planos): manter a graca E
// tornar o uso observavel — NUNCA cortar acesso aqui. O corte definitivo
// (downgrade para JOGADOR) continua a cargo do cron pos-graca.
//
// Padrao espelhado de legacy-auth-counter.ts:
//   - Cumulativo (sem TTL): `motor:metrics:paid_feature_grace_usage:{dimension}`
//   - Hora rolante (TTL 25h): `...:{dimension}:h:{YYYYMMDDHH}`
//   - Sempre stdout (visivel em `railway logs` mesmo sem Redis) + breadcrumb Sentry.
//   - Fail-open: instrumentacao NUNCA propaga erro para o caller.
// ============================================================================

import 'server-only'

import * as Sentry from '@sentry/nextjs'
import { getRedisClient } from '@/lib/redis'

const KEY_PREFIX = 'motor:metrics:paid_feature_grace_usage'
const HOUR_TTL_SECONDS = 25 * 3600 // 25h cobre folga para reads de 24h

export interface PaidFeatureGraceContext {
  userId?: string
  /** Plano vigente que ainda concede acesso durante a graca (ex: 'LENDA'). */
  plan?: string | null
  /** Plano minimo exigido pela rota/feature (ex: 'CRAQUE'). */
  requiredPlan?: string | null
  /** Feature paga especifica, quando conhecida (ex: 'ai_analysis'). */
  feature?: string | null
}

function hourBucket(date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  return `${y}${m}${d}${h}`
}

/**
 * Registra um uso de feature paga durante a graca pos-expiracao.
 * `dimension` e o eixo de agregacao (feature especifica OU `plan:{requiredPlan}`).
 * Fail-open: erros de Redis/Sentry nunca devem propagar para o caller.
 */
export async function recordPaidFeatureGraceUsage(
  dimension: string,
  context?: PaidFeatureGraceContext,
): Promise<void> {
  // stdout SEMPRE — canal de diagnostico que aparece em `railway logs` mesmo
  // quando Redis esta ausente ou o transport Sentry nao entrega. Sem PII:
  // apenas a dimensao e ids tecnicos.
  console.warn(
    `[PAID_FEATURE_GRACE] dimension=${dimension}` +
      (context?.userId ? ` user=${context.userId}` : '') +
      (context?.plan ? ` plan=${context.plan}` : '') +
      (context?.requiredPlan ? ` requiredPlan=${context.requiredPlan}` : ''),
  )

  try {
    Sentry.addBreadcrumb({
      category: 'subscription.grace.paid_feature',
      level: 'warning',
      message: `paid feature used during post-expiration grace: ${dimension}`,
      data: context,
    })
  } catch {
    /* ignora */
  }

  const r = getRedisClient()
  if (!r) return

  const cumulativeKey = `${KEY_PREFIX}:${dimension}`
  const hourlyKey = `${KEY_PREFIX}:${dimension}:h:${hourBucket()}`

  try {
    const pipeline = r.pipeline()
    pipeline.incr(cumulativeKey)
    pipeline.incr(hourlyKey)
    pipeline.expire(hourlyKey, HOUR_TTL_SECONDS)
    await pipeline.exec()
  } catch {
    // fail-open: instrumentacao nunca quebra o caminho real da feature paga
  }
}

export interface PaidFeatureGraceMetricsResult {
  dimension: string
  windowHours: number
  generatedAt: string
  cumulative: number
  windowTotal: number
}

/**
 * Le os contadores agregados de uma dimensao na janela informada (default 24h).
 * Degrada para zeros (sem throw) quando Redis esta ausente ou falha.
 */
export async function getPaidFeatureGraceMetrics(
  dimension: string,
  windowHours = 24,
): Promise<PaidFeatureGraceMetricsResult> {
  const safeWindow = Math.max(1, Math.min(windowHours, 24 * 14))
  const now = new Date()
  const empty: PaidFeatureGraceMetricsResult = {
    dimension,
    windowHours: safeWindow,
    generatedAt: now.toISOString(),
    cumulative: 0,
    windowTotal: 0,
  }

  const r = getRedisClient()
  if (!r) return empty

  try {
    const pipeline = r.pipeline()
    pipeline.get(`${KEY_PREFIX}:${dimension}`) // idx 0 = cumulativo
    for (let i = 0; i < safeWindow; i++) {
      const bucket = hourBucket(new Date(now.getTime() - i * 3600 * 1000))
      pipeline.get(`${KEY_PREFIX}:${dimension}:h:${bucket}`)
    }

    const results = await pipeline.exec()
    if (!results) return empty

    let cumulative = 0
    let windowTotal = 0
    results.forEach((res, idx) => {
      if (!res) return
      const [, value] = res
      const n = value ? parseInt(String(value), 10) || 0 : 0
      if (idx === 0) cumulative = n
      else windowTotal += n
    })

    return { ...empty, cumulative, windowTotal }
  } catch {
    return empty
  }
}
