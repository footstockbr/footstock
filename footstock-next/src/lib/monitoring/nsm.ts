// ============================================================================
// Foot Stock — North Star Metric (NSM)
// Cálculo: ordens com status FILLED no dia corrente (BRT).
// Meta: 500 ordens/dia. Alerta: < 200 às 20h BRT.
// Cache Redis: TTL 5min (intraday), 31 dias (histórico).
// NUNCA expõe dados de usuários individuais — apenas contagens agregadas.
// Rastreabilidade: INT-115, module-27/TASK-3
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'

// ---------------------------------------------------------------------------
// Constantes configuráveis via env (sem redeploy)
// ---------------------------------------------------------------------------

export const NSM_TARGET = (() => {
  const v = parseInt(process.env.NSM_TARGET ?? '500', 10)
  if (isNaN(v)) {
    console.warn('[nsm] NSM_TARGET inválido — usando default 500')
    return 500
  }
  return v
})()

export const NSM_ALERT_THRESHOLD = (() => {
  const v = parseInt(process.env.NSM_ALERT_THRESHOLD ?? '200', 10)
  if (isNaN(v)) {
    console.warn('[nsm] NSM_ALERT_THRESHOLD inválido — usando default 200')
    return 200
  }
  return v
})()

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface NSMTrendPoint {
  date: string
  count: number
}

export type AlertStatus = 'on_track' | 'below_target' | 'critical'

export interface NSMData {
  today: number
  target: number
  threshold: number
  progressPercent: number
  trend: NSMTrendPoint[]
  weekAvg: number
  monthAvg: number
  alertStatus: AlertStatus
}

// ---------------------------------------------------------------------------
// Helpers de data BRT
// ---------------------------------------------------------------------------

/** Retorna o início do dia atual no fuso BRT (America/Sao_Paulo) */
function startOfTodayBRT(): Date {
  const now = new Date()
  const brtStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  // brtStr = "YYYY-MM-DD"
  return new Date(`${brtStr}T00:00:00-03:00`)
}

/** Retorna a hora atual em BRT (0-23) */
function currentHourBRT(): number {
  const nowBRT = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  return new Date(nowBRT).getHours()
}

// ---------------------------------------------------------------------------
// NSM: contagem do dia atual
// ---------------------------------------------------------------------------

/**
 * Retorna count de ordens FILLED hoje (BRT), usando cache Redis (TTL 5min).
 * Fallback para Prisma direto se Redis indisponível.
 */
export async function getTodayNSM(): Promise<number> {
  const cacheKey = 'nsm:today'

  // Tentar cache Redis
  try {
    const cached = await redisPublisher.get(cacheKey)
    if (cached !== null) {
      return parseInt(cached, 10)
    }
  } catch {
    // Redis indisponível — continuar para fallback Prisma
  }

  // Fallback: Prisma
  const startBRT = startOfTodayBRT()
  const count = await prisma.order.count({
    where: {
      status: 'EXECUTED',
      executedAt: { gte: startBRT },
    },
  })

  // Salvar cache (TTL 5min = 300s)
  try {
    await redisPublisher.setex(cacheKey, 300, count.toString())
  } catch {
    // Redis indisponível — continuar sem cache
  }

  return count
}

// ---------------------------------------------------------------------------
// NSM: tendência histórica
// ---------------------------------------------------------------------------

/**
 * Retorna trend dos últimos N dias (BRT), usando cache Redis.
 * Fallback para Prisma direto.
 */
export async function getNSMTrend(days: number): Promise<NSMTrendPoint[]> {
  const cacheKey = 'nsm:history'

  try {
    const cached = await redisPublisher.get(cacheKey)
    if (cached) {
      const history: NSMTrendPoint[] = JSON.parse(cached)
      // Filtrar para o período solicitado
      return history.slice(0, days)
    }
  } catch {
    // Redis indisponível — continuar para Prisma
  }

  // Fallback: Prisma raw query com timezone BRT
  const results = await prisma.$queryRaw<{ date: string; count: number }[]>`
    SELECT
      TO_CHAR(executed_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS date,
      COUNT(*)::integer AS count
    FROM orders
    WHERE status = 'EXECUTED'
      AND executed_at >= NOW() - (${days} * INTERVAL '1 day')
    GROUP BY date
    ORDER BY date DESC
  `

  return results.map(r => ({ date: r.date, count: Number(r.count) }))
}

/** Média de ordens dos últimos 7 dias */
export async function getWeekAvg(): Promise<number> {
  const trend = await getNSMTrend(7)
  if (trend.length === 0) return 0
  const sum = trend.reduce((acc, p) => acc + p.count, 0)
  return Math.round(sum / trend.length)
}

/** Média de ordens dos últimos 30 dias */
export async function getMonthAvg(): Promise<number> {
  const trend = await getNSMTrend(30)
  if (trend.length === 0) return 0
  const sum = trend.reduce((acc, p) => acc + p.count, 0)
  return Math.round(sum / trend.length)
}

// ---------------------------------------------------------------------------
// NSM: status de alerta
// ---------------------------------------------------------------------------

/**
 * Avalia alert status com base no progresso do dia vs meta.
 * - 'critical': após 20h BRT e NSM < NSM_ALERT_THRESHOLD
 * - 'below_target': progresso < 80% do esperado proporcionalmente
 * - 'on_track': progresso adequado
 */
export async function checkNSMAlert(): Promise<AlertStatus> {
  const today = await getTodayNSM()
  const hour = currentHourBRT()

  // Alerta crítico: fim do dia e abaixo do limiar mínimo
  if (hour >= 20 && today < NSM_ALERT_THRESHOLD) return 'critical'

  // below_target: progresso < 80% do esperado proporcionalmente à hora
  const progressRate = today / NSM_TARGET
  const expectedRate = hour / 24

  if (expectedRate > 0 && progressRate < expectedRate * 0.8) return 'below_target'

  return 'on_track'
}
