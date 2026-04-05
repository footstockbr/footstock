// ============================================================================
// Foot Stock — GET /api/cron/expire-dividends (0 8 * * *)
// Handler Vercel Cron para expiração diária de dividendos PENDING.
// Roda ANTES do credit-dividends (08:00 vs 09:00 UTC) para evitar crédito
// de dividendos que já deveriam expirar.
// Rastreabilidade: INT-073 / RN-DIV-001
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { expirePendingDividends } from '@/lib/jobs/expire-dividends'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    console.warn('[cron/expire-dividends] Tentativa de acesso não autorizado')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await expirePendingDividends()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/expire-dividends] Erro crítico:', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
