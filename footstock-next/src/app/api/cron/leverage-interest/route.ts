// ============================================================================
// FootStock — /api/cron/leverage-interest (30 7 * * *)
// Juros diários sobre posições LONG alavancadas (plano Lenda).
// Autenticado por CRON_SECRET — 401 silencioso se inválido.
// Rastreabilidade: T-003 / INT-TRD-005
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { processLeverageInterest } from '@/lib/jobs/leverage-interest'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const result = await processLeverageInterest()

    return NextResponse.json({
      success: true,
      processed: result.processed,
      totalInterest: result.totalInterest,
      liquidated: result.liquidated,
      errors: result.errors,
      processedAt: result.processedAt,
    })
  } catch (err) {
    console.error('[cron/leverage-interest] Erro:', err)
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}
