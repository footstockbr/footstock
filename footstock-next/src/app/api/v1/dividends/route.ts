// ============================================================================
// FootStock — GET /api/v1/dividends
// Histórico paginado de dividendos do usuário autenticado.
// Suporta filtros por type (3 modalidades + legado) e status (incluindo BLOCKED_PLAN).
// Rastreabilidade: INT-072, INT-073 / T-007
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { DIVIDEND_TYPE, DIVIDEND_STATUS } from '@/lib/enums'
import { dividendRepository } from '@/lib/repositories/DividendRepository'

const PAGE_SIZE = 20

const validTypes = Object.values(DIVIDEND_TYPE)
const validStatuses = Object.values(DIVIDEND_STATUS)

function isDividendType(value: string): value is (typeof DIVIDEND_TYPE)[keyof typeof DIVIDEND_TYPE] {
  return validTypes.includes(value as (typeof DIVIDEND_TYPE)[keyof typeof DIVIDEND_TYPE])
}

function isDividendStatus(value: string): value is (typeof DIVIDEND_STATUS)[keyof typeof DIVIDEND_STATUS] {
  return validStatuses.includes(value as (typeof DIVIDEND_STATUS)[keyof typeof DIVIDEND_STATUS])
}

async function handler(req: NextRequest, { user }: AuthContext) {
  try {
    const { searchParams } = new URL(req.url)
    // `|| 1` neutraliza NaN (ex: ?page=abc), o cap evita skip gigante / overflow.
    const page = Math.min(100_000, Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1))
    const type = searchParams.get('type') ?? undefined
    const status = searchParams.get('status') ?? undefined

    const filteredType = type && isDividendType(type) ? type : undefined
    const filteredStatus = status && isDividendStatus(status) ? status : undefined

    const { items, total } = await dividendRepository.findByUserPaginated(user.id, {
      type: filteredType,
      status: filteredStatus,
      page,
      pageSize: PAGE_SIZE,
    })

    const totalPages = Math.ceil(total / PAGE_SIZE)
    const now = Date.now()

    // Enriquecer itens PENDING com daysRemaining
    const enrichedItems = items.map(d => {
      if (d.status !== DIVIDEND_STATUS.PENDING) return d
      const msElapsed = now - new Date(d.createdAt).getTime()
      const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24))
      const daysRemaining = Math.max(0, 7 - daysElapsed)
      return { ...d, daysRemaining }
    })

    return NextResponse.json({
      success: true,
      data: {
        items: enrichedItems,
        meta: {
          page,
          pageSize: PAGE_SIZE,
          totalItems: total,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
        },
      },
    })
  } catch (err) {
    console.error('[GET /api/v1/dividends]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}

export const GET = withAuth(handler)
