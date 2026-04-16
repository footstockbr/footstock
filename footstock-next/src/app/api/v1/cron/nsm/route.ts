// ============================================================================
// FootStock — GET /api/v1/cron/nsm — Trigger NSM Report
// Protegido por Bearer CRON_SECRET.
// Dispara runNSMReport() e retorna resultado.
// Schedule: 0 23 * * * UTC = 20:00 BRT (via vercel.json)
// Rastreabilidade: INT-115, module-27/TASK-3
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { runNSMReport } from '@/lib/jobs/nsm-report'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Validar CRON_SECRET
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (!cronSecret) {
    console.error('[cron/v1/nsm] CRON_SECRET não configurado')
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 401 })
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const result = await runNSMReport()

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (err) {
    console.error('[cron/v1/nsm] Erro ao executar NSM report:', err)
    return NextResponse.json({ error: 'Erro interno no job NSM' }, { status: 500 })
  }
}
