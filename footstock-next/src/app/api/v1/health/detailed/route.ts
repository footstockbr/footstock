// ============================================================================
// FootStock — GET /api/v1/health/detailed — Health Check Detalhado (admin)
// Requer role Monitor (admin:dashboard). Retorna latências em ms para diagnóstico.
// SYS_002 (503) se componente crítico falhar. AUTH_001 (403) sem autorização.
// Rastreabilidade: INT-110, module-27/TASK-2
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { runDetailedChecks, getOverallStatus } from '@/lib/monitoring/health'

export const dynamic = 'force-dynamic'

export const GET = withAdmin('admin:dashboard')(async (_request: NextRequest) => {
  const report = await runDetailedChecks()
  const overall = getOverallStatus(report)

  return NextResponse.json(
    {
      status: overall,
      components: report.components,
      uptime: Math.round(report.uptime),
      nodeVersion: report.nodeVersion,
      timestamp: report.timestamp,
    },
    {
      status: overall === 'error' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    }
  )
})
