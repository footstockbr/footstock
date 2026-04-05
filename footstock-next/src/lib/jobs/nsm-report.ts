// ============================================================================
// Foot Stock — NSM Report Job (cron diário 20h BRT)
// Calcula NSM do dia, persiste histórico no Redis, dispara alerta Sentry se crítico.
// Chamado via GET /api/v1/cron/nsm (protegido por CRON_SECRET).
// Rastreabilidade: INT-115, module-27/TASK-3
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'
import { captureException } from '@/lib/monitoring/sentry'
import { NSM_TARGET, NSM_ALERT_THRESHOLD, type AlertStatus, type NSMTrendPoint } from '@/lib/monitoring/nsm'

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Data ISO YYYY-MM-DD no fuso BRT */
function todayISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Hora atual em BRT (0-23) */
function currentHourBRT(): number {
  const nowBRT = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  return new Date(nowBRT).getHours()
}

/** Início do dia BRT como Date UTC */
function startOfTodayBRT(): Date {
  const dateStr = todayISO()
  return new Date(`${dateStr}T00:00:00-03:00`)
}

// ---------------------------------------------------------------------------
// Execução principal
// ---------------------------------------------------------------------------

export interface NSMReportResult {
  date: string
  today: number
  target: number
  threshold: number
  alertStatus: AlertStatus
  alertDispatched: boolean
}

/**
 * Executa o relatório NSM:
 * 1. Conta ordens FILLED hoje (Prisma — fonte da verdade, NÃO cache)
 * 2. Persiste no Redis: nsm:today (TTL 5min) + nsm:history (TTL 31 dias)
 * 3. Dispara alerta Sentry se NSM < threshold às 20h+ BRT
 */
export async function runNSMReport(): Promise<NSMReportResult> {
  const dateStr = todayISO()
  const startBRT = startOfTodayBRT()

  // 1. Fonte da verdade: Prisma (não Redis, para garantir precisão no relatório)
  const count = await prisma.order.count({
    where: {
      status: 'EXECUTED',
      executedAt: { gte: startBRT },
    },
  })

  // 2. Persistir no Redis
  try {
    // Cache intraday (5min)
    await redisPublisher.setex('nsm:today', 300, count.toString())

    // Histórico 30 dias
    const historyKey = 'nsm:history'
    const existing = await redisPublisher.get(historyKey)
    let history: NSMTrendPoint[] = existing ? (JSON.parse(existing) as NSMTrendPoint[]) : []

    // Upsert do dia atual
    const idx = history.findIndex(p => p.date === dateStr)
    if (idx >= 0) {
      history[idx] = { date: dateStr, count }
    } else {
      history.unshift({ date: dateStr, count })
    }
    // Truncar para 30 entradas (mais recentes primeiro)
    history = history.slice(0, 30)

    // TTL 31 dias em segundos
    await redisPublisher.setex(historyKey, 31 * 24 * 60 * 60, JSON.stringify(history))
  } catch (redisErr) {
    console.error('[nsm-report] Erro ao persistir no Redis:', redisErr)
  }

  // 3. Avaliação de alerta
  const hour = currentHourBRT()
  const alertDispatched = hour >= 20 && count < NSM_ALERT_THRESHOLD

  if (alertDispatched) {
    captureException(
      new Error(`NSM crítico: ${count} ordens (meta: ${NSM_TARGET}, mínimo: ${NSM_ALERT_THRESHOLD})`),
      {
        tags: { alert: 'nsm_critical' },
        nsm: count,
        target: NSM_TARGET,
        threshold: NSM_ALERT_THRESHOLD,
        date: dateStr,
      }
    )
    console.warn(
      `[nsm-report] ALERTA NSM_CRITICAL: ${count}/${NSM_TARGET} (threshold: ${NSM_ALERT_THRESHOLD})`
    )
  }

  const alertStatus: AlertStatus =
    hour >= 20 && count < NSM_ALERT_THRESHOLD
      ? 'critical'
      : count >= NSM_TARGET * 0.8
        ? 'on_track'
        : 'below_target'

  console.log(`[nsm-report] ${dateStr}: ${count}/${NSM_TARGET} — ${alertStatus}`)

  return {
    date: dateStr,
    today: count,
    target: NSM_TARGET,
    threshold: NSM_ALERT_THRESHOLD,
    alertStatus,
    alertDispatched,
  }
}
