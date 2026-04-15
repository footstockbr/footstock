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
        realName: true,
        division: true,
        currentPrice: true,
        fairValue: true,
        openPrice: true,
        volume: true,
        isHalted: true,
        haltReason: true,
        sentiment: true,
        updatedAt: true,
      },
      orderBy: { ticker: 'asc' },
    })

    return ok(
      assets.map((a) => {
        const current = a.currentPrice.toNumber()
        const fv = a.fairValue.toNumber()
        const open = a.openPrice ? a.openPrice.toNumber() : current

        return {
          id: a.id,
          ticker: a.ticker,
          displayName: a.displayName,
          realName: a.realName ?? null,
          division: a.division,
          currentPrice: current,
          fairValue: fv,
          volume24h: Number(a.volume),
          // Desvio do Fair Value (mantido para compatibilidade)
          priceChange:
            fv > 0
              ? Math.round(((current - fv) / fv) * 10000) / 100
              : 0,
          // Variação temporal real (current vs open do dia)
          priceChange24h:
            open > 0
              ? Math.round(((current - open) / open) * 10000) / 100
              : 0,
          isHalted: a.isHalted,
          haltReason: a.haltReason ?? null,
          sentiment: a.sentiment,
          updatedAt: a.updatedAt.toISOString(),
        }
      })
    )
  } catch {
    return errors.server()
  }
}
