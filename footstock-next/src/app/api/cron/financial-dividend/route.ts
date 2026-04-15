// ============================================================================
// Foot Stock — GET /api/cron/financial-dividend
// Vercel Cron: executa dividendo financeiro periódico (1º dia útil, 02:00 UTC-3).
// Schedule: "0 5 1-7 * *" (05:00 UTC = 02:00 BRT, dias 1-7 do mês)
// Autenticado por CRON_SECRET no header Authorization.
// Rastreabilidade: T-007 §3
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { runFinancialDividendCron } from '@/lib/jobs/financialDividendCron'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    console.warn('[cron/financial-dividend] Tentativa de acesso não autorizado')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runFinancialDividendCron()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[cron/financial-dividend] Erro crítico:', err)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
