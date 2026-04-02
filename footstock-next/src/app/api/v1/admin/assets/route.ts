import { NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

// GET /api/v1/admin/assets — Monitor+ — lista todos os 40 ativos com halt status
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
      { status: 403 }
    )
  }

  try {
    const assets = await prisma.asset.findMany({
      select: {
        id: true,
        ticker: true,
        displayName: true,
        division: true,
        currentPrice: true,
        fairValue: true,
        isHalted: true,
        haltReason: true,
        sentiment: true,
        updatedAt: true,
      },
      orderBy: { ticker: 'asc' },
    })

    return ok(
      assets.map((a) => ({
        id: a.id,
        ticker: a.ticker,
        displayName: a.displayName,
        division: a.division,
        currentPrice: a.currentPrice.toNumber(),
        fairValue: a.fairValue.toNumber(),
        priceChange:
          a.fairValue.toNumber() > 0
            ? Math.round(
                ((a.currentPrice.toNumber() - a.fairValue.toNumber()) /
                  a.fairValue.toNumber()) *
                  10000
              ) / 100
            : 0,
        isHalted: a.isHalted,
        haltReason: a.haltReason ?? null,
        sentiment: a.sentiment,
        updatedAt: a.updatedAt.toISOString(),
      }))
    )
  } catch {
    return errors.server()
  }
}
