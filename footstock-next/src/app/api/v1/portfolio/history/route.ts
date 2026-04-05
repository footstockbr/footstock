// ============================================================================
// Foot Stock — GET /api/v1/portfolio/history?period=
// Histórico de evolução do patrimônio com dados REAIS + LOCF (module-15 — ST004).
// Rastreabilidade: INT-024
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { positionRepository } from '@/lib/repositories/PositionRepository'
import type { PortfolioPeriod } from '@/lib/enums'

const periodSchema = z.enum(['1H', '12H', '24H', '7D', '30D', '1Y', 'ALL']).default('7D')

async function handler(req: NextRequest, { user }: AuthContext) {
  try {
    const { searchParams } = new URL(req.url)
    const parsed = periodSchema.safeParse(searchParams.get('period') ?? undefined)

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VAL_002',
            message: 'Período inválido. Valores aceitos: 1H, 12H, 24H, 7D, 30D, 1Y, ALL.',
          },
        },
        { status: 400 }
      )
    }

    const history = await positionRepository.getHistory(
      user.id,
      parsed.data as PortfolioPeriod
    )

    return NextResponse.json(
      { success: true, data: history },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, max-age=60' },
      }
    )
  } catch (err) {
    console.error('[GET /api/v1/portfolio/history]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handler)
