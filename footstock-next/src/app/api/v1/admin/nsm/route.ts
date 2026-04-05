// ============================================================================
// Foot Stock — GET /api/v1/admin/nsm — Dashboard North Star Metric
// Requer role Monitor (admin:dashboard).
// Retorna dados agregados — NUNCA expõe dados de usuários individuais.
// Rastreabilidade: INT-115, module-27/TASK-3
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import {
  getTodayNSM,
  getNSMTrend,
  getWeekAvg,
  getMonthAvg,
  checkNSMAlert,
  NSM_TARGET,
  NSM_ALERT_THRESHOLD,
} from '@/lib/monitoring/nsm'

export const dynamic = 'force-dynamic'

export const GET = withAdmin('admin:dashboard')(async (_request: NextRequest) => {
  try {
    // Buscar todos os dados em paralelo
    const [today, trend, weekAvg, monthAvg, alertStatus] = await Promise.all([
      getTodayNSM(),
      getNSMTrend(30),
      getWeekAvg(),
      getMonthAvg(),
      checkNSMAlert(),
    ])

    const progressPercent = Math.round((today / NSM_TARGET) * 1000) / 10

    return NextResponse.json(
      {
        today,
        target: NSM_TARGET,
        threshold: NSM_ALERT_THRESHOLD,
        progressPercent,
        trend,
        weekAvg,
        monthAvg,
        alertStatus,
      },
      {
        headers: {
          // 5 min de cache CDN (dado não é sensível em nível de segundo)
          'Cache-Control': 's-maxage=300, stale-while-revalidate=60',
        },
      }
    )
  } catch (err) {
    console.error('[api/v1/admin/nsm] Erro ao buscar dados NSM:', err)
    return NextResponse.json(
      { error: 'SYS_002', message: 'Serviço temporariamente indisponível' },
      { status: 503 }
    )
  }
})
