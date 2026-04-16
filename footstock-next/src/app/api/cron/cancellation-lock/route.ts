// ============================================================================
// FootStock — /api/cron/cancellation-lock (0 * * * * — a cada hora)
// T+48h: liquida posições RESTRITAS (SHORT, OCO, alavancadas)
// NÃO cancela assinatura — apenas liquida posições restritas
// Ver /api/cron/cancellation-expiry para o T+7d (cancelamento definitivo)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { processForcedLiquidations } from '@/lib/jobs/cancellation-lock'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const result = await processForcedLiquidations()
    console.log('[cron/cancellation-lock T+48h]', result)
    return NextResponse.json({ processed: result.processed, errors: result.errors, details: result.details })
  } catch (err) {
    console.error('[cron/cancellation-lock T+48h] Erro crítico:', err)
    return NextResponse.json({ processed: 0, errors: 1 }, { status: 500 })
  }
}
