// ============================================================================
// FootStock — GET /api/v1/positions/summary
// Resumo de patrimônio total com P&L e diversificação (module-15 — ST003).
// Rastreabilidade: INT-023
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { type AuthContext } from '@/app/api/middleware'
import { withDataAccessLog } from '@/lib/utils/data-access-logger'
import { positionRepository } from '@/lib/repositories/PositionRepository'

async function handler(_req: NextRequest, { user }: AuthContext) {
  try {
    const summary = await positionRepository.getSummary(user.id)
    return NextResponse.json(
      { success: true, data: summary },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, max-age=30' },
      }
    )
  } catch (err) {
    console.error('[GET /api/v1/positions/summary]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}

export const GET = withDataAccessLog(handler, 'positions-summary')
