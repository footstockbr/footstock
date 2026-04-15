// ============================================================================
// Foot Stock — GET /api/v1/dividends/yield-pending
// Retorna resumo de yield diferencial pendente por ticker para o JOGADOR autenticado.
// Retorna lista vazia para CRAQUE/LENDA (não acumulam pending).
// Rastreabilidade: T-007 §4 / §6
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { PLAN_TYPE } from '@/lib/enums'
import { yieldDifferentialService } from '@/lib/services/dividends/YieldDifferentialService'

async function handler(_req: NextRequest, { user }: AuthContext) {
  try {
    // CRAQUE/LENDA não têm yield pendente
    if (user.planType !== PLAN_TYPE.JOGADOR) {
      return NextResponse.json({ success: true, data: { items: [], totalPending: 0 } })
    }

    const items = await yieldDifferentialService.getPendingSummaryByUser(user.id)
    const totalPending = items.reduce((sum, i) => sum + i.totalPending, 0)

    return NextResponse.json({
      success: true,
      data: { items, totalPending },
    })
  } catch (err) {
    console.error('[GET /api/v1/dividends/yield-pending]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handler)
