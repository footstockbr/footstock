// ============================================================================
// FootStock — Legacy Supabase Auth Counter (NXAUTH-08A)
// ----------------------------------------------------------------------------
// Instrumenta chamadas residuais a `supabase.auth.*` durante a janela dual
// Auth.js + Supabase. Conta em Redis para alimentar o sunset gate de
// NXAUTH-09 (≥7d zero traffic) e gera breadcrumbs Sentry para troubleshooting.
//
// Buckets canônicos:
//   - Cumulativo (sem TTL): `motor:metrics:legacy_supabase_auth:{operation}`
//   - Hora rolante (TTL 25h): `motor:metrics:legacy_supabase_auth:{operation}:h:{YYYYMMDDHH}`
//
// Sunset gate (NXAUTH-09): TODAS as operations precisam de zero hits no
// somatório das últimas 168 horas (7 dias) para liberar a remoção.
// ============================================================================

import 'server-only'

import * as Sentry from '@sentry/nextjs'
import { getRedisClient } from '@/lib/redis'

export const LEGACY_AUTH_OPERATIONS = [
  'getUser',
  'signInWithPassword',
  'setSession',
  'refreshSession',
  'signOut',
  'resetPasswordForEmail',
  'exchangeCodeForSession',
  'updateUser',
  'admin.createUser',
  'admin.deleteUser',
  'admin.updateUserById',
  'admin.inviteUserByEmail',
] as const

export type LegacyAuthOperation = (typeof LEGACY_AUTH_OPERATIONS)[number]

const KEY_PREFIX = 'motor:metrics:legacy_supabase_auth'
const HOUR_TTL_SECONDS = 25 * 3600 // 25h cobre folga para reads de 24h

function hourBucket(date: Date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  return `${y}${m}${d}${h}`
}

/**
 * Registra uma chamada a uma operação legada de Supabase Auth.
 * Fail-open: erros de Redis nunca devem propagar para o caller.
 */
export async function recordLegacyAuthCall(
  operation: LegacyAuthOperation,
  context?: Record<string, unknown>,
): Promise<void> {
  // Sentry breadcrumb síncrono — barato, ajuda a localizar quem chamou.
  try {
    Sentry.addBreadcrumb({
      category: `auth.legacy.${operation}`,
      level: 'info',
      message: `legacy supabase auth call: ${operation}`,
      data: context,
    })
  } catch { /* ignora */ }

  const r = getRedisClient()
  if (!r) return

  const cumulativeKey = `${KEY_PREFIX}:${operation}`
  const hourlyKey = `${KEY_PREFIX}:${operation}:h:${hourBucket()}`

  try {
    const pipeline = r.pipeline()
    pipeline.incr(cumulativeKey)
    pipeline.incr(hourlyKey)
    pipeline.expire(hourlyKey, HOUR_TTL_SECONDS)
    await pipeline.exec()
  } catch {
    // fail-open: instrumentação nunca quebra a auth path real
  }
}

export interface LegacyAuthMetricsResult {
  windowHours: number
  generatedAt: string
  totals: Record<LegacyAuthOperation, number>
  cumulative: Record<LegacyAuthOperation, number>
  totalCalls: number
  totalCumulative: number
  sunsetReady: boolean
}

/**
 * Lê os contadores agregados da janela informada (default: 24h).
 * Para sunset gate de NXAUTH-09, usar `windowHours = 168` (7 dias).
 */
export async function getLegacyAuthMetrics(
  windowHours = 24,
): Promise<LegacyAuthMetricsResult> {
  const safeWindow = Math.max(1, Math.min(windowHours, 24 * 14))
  const now = new Date()
  const totals = {} as Record<LegacyAuthOperation, number>
  const cumulative = {} as Record<LegacyAuthOperation, number>

  for (const op of LEGACY_AUTH_OPERATIONS) {
    totals[op] = 0
    cumulative[op] = 0
  }

  const r = getRedisClient()
  if (!r) {
    return {
      windowHours: safeWindow,
      generatedAt: now.toISOString(),
      totals,
      cumulative,
      totalCalls: 0,
      totalCumulative: 0,
      sunsetReady: false, // sem Redis não há evidência → bloqueia sunset
    }
  }

  try {
    const pipeline = r.pipeline()
    const ops: { op: LegacyAuthOperation; type: 'cumulative' | 'hourly'; bucket?: string }[] = []

    for (const op of LEGACY_AUTH_OPERATIONS) {
      pipeline.get(`${KEY_PREFIX}:${op}`)
      ops.push({ op, type: 'cumulative' })

      for (let i = 0; i < safeWindow; i++) {
        const bucketDate = new Date(now.getTime() - i * 3600 * 1000)
        const bucket = hourBucket(bucketDate)
        pipeline.get(`${KEY_PREFIX}:${op}:h:${bucket}`)
        ops.push({ op, type: 'hourly', bucket })
      }
    }

    const results = await pipeline.exec()
    if (results) {
      results.forEach((res, idx) => {
        const meta = ops[idx]
        if (!meta || !res) return
        const [, value] = res
        const n = value ? parseInt(String(value), 10) || 0 : 0
        if (meta.type === 'cumulative') cumulative[meta.op] = n
        else totals[meta.op] += n
      })
    }
  } catch {
    // fallback degradado: zeros mas sunsetReady=false
    return {
      windowHours: safeWindow,
      generatedAt: now.toISOString(),
      totals,
      cumulative,
      totalCalls: 0,
      totalCumulative: 0,
      sunsetReady: false,
    }
  }

  const totalCalls = Object.values(totals).reduce((a, b) => a + b, 0)
  const totalCumulative = Object.values(cumulative).reduce((a, b) => a + b, 0)

  // sunsetReady requer DOIS sinais (anti falso-positivo do spec NXAUTH-08A):
  //   1. zero chamadas na janela observada (default 24h, sunset gate usa 168h)
  //   2. cumulative > 0 — evidencia de que a instrumentacao ja disparou
  //      alguma vez. Sem isso, "zero traffic" pode significar "instrumentacao
  //      quebrada" (Proxy nao wrappeou, helper nao foi chamado, etc) — o
  //      que NAO autoriza o sunset destrutivo de NXAUTH-09.
  const sunsetReady = totalCalls === 0 && totalCumulative > 0

  return {
    windowHours: safeWindow,
    generatedAt: now.toISOString(),
    totals,
    cumulative,
    totalCalls,
    totalCumulative,
    sunsetReady,
  }
}
