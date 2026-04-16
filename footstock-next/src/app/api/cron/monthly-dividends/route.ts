// ============================================================================
// FootStock — GET /api/cron/monthly-dividends (0 9 1 * *)
// Handler Vercel Cron para dividendo financeiro mensal.
// Autenticado por CRON_SECRET no header Authorization.
// Rastreabilidade: INT-073
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { runMonthlyDividends } from '@/lib/jobs/monthly-dividends'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    console.warn('[cron/monthly-dividends] Tentativa de acesso não autorizado')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMonthlyDividends()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/monthly-dividends] Erro crítico:', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
