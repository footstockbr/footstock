// ============================================================================
// Foot Stock — GET /api/cron/credit-dividends (0 9 * * *)
// Handler Vercel Cron para crédito diário de dividendos PENDING prontos.
// Roda APÓS expire-dividends (09:00 vs 08:00 UTC).
// Rastreabilidade: INT-073
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { creditReadyDividends } from '@/lib/jobs/credit-dividends'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    console.warn('[cron/credit-dividends] Tentativa de acesso não autorizado')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await creditReadyDividends()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/credit-dividends] Erro crítico:', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
