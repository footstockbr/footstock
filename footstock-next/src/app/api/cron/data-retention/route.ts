// ============================================================================
// FootStock — /api/cron/data-retention (0 0 * * *)
// Cron diário (00:00 BRT): retenção de dados LGPD
// Autenticado por CRON_SECRET
// Rastreabilidade: INT-108, TASK-3/ST001
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { runDataRetentionJob } from '@/lib/jobs/data-retention'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const report = await runDataRetentionJob()
    return NextResponse.json({ success: true, report })
  } catch (error) {
    console.error('[cron/data-retention] Erro:', error)
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    )
  }
}
