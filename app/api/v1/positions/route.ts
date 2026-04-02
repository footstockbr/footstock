// ============================================================================
// Foot Stock — GET /api/v1/positions
// Posições abertas com P&L calculado em tempo real (module-15 — ST002).
// Rastreabilidade: INT-034, INT-035
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { type AuthContext } from '@/app/api/middleware'
import { withDataAccessLog } from '@/lib/utils/data-access-logger'
import { positionRepository } from '@/lib/repositories/PositionRepository'

async function handler(_req: NextRequest, { user }: AuthContext) {
  try {
    // Busca posições com P&L calculado usando dados reais de price_history
    const positions = await positionRepository.findByUserId(user.id)
    return NextResponse.json(
      { success: true, data: positions },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, max-age=30' },
      }
    )
  } catch (err) {
    console.error('[GET /api/v1/positions]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}

export const GET = withDataAccessLog(handler, 'positions')
