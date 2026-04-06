import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { list, errors, parsePagination, buildPagination } from '@/lib/api'
import type { PositionSide } from '@/types'

// GET /api/v1/positions
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const side = searchParams.get('side') as PositionSide | null
  const assetId = searchParams.get('assetId')
  const { page, limit, skip } = parsePagination(searchParams)

  try {
    const where = {
      userId: auth.user.id,
      quantity: { gt: 0 }, // apenas posições abertas
      ...(side && { side }),
      ...(assetId && { assetId }),
    }

    const [positions, total] = await Promise.all([
      prisma.position.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.position.count({ where }),
    ])

    const serialized = positions.map((p) => ({
      id: p.id,
      userId: p.userId,
      assetId: p.assetId,
      quantity: p.quantity,
      avgPrice: p.avgPrice.toNumber(),
      side: p.side as PositionSide,
      status: p.status,
      marginBlocked: p.marginBlocked.toNumber(),
      leverageMultiplier: p.leverageMultiplier,
      leverageAmount: p.leverageAmount.toNumber(),
      dailyInterestRate: p.dailyInterestRate.toNumber(),
      interestAccrued: p.interestAccrued.toNumber(),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }))

    return list(serialized, buildPagination(page, limit, total))
  } catch {
    return errors.server()
  }
}
