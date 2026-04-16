// ============================================================================
// FootStock — /api/cron/interest-accrual (0 7 * * *)
// Acúmulo de juros diário sobre posições SHORT abertas.
// Autenticado por CRON_SECRET — resposta 401 silenciosa se inválido.
// Rastreabilidade: INT-014 / TASK-4/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { processInterestAccrual } from '@/lib/jobs/interest-accrual'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const result = await processInterestAccrual()

    return NextResponse.json({
      success: true,
      processed: result.processed,
      totalInterest: result.totalInterest,
      errors: result.errors,
      processedAt: result.processedAt,
    })
  } catch (err) {
    console.error('[cron/interest-accrual] Erro:', err)
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    )
  }
}
