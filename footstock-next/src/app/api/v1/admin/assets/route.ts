import { NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { classifySentimentStaleness, resolveStalenessThreshold } from '@/lib/sentiment-staleness'

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
        sentimentScore: true,
        sentimentReason: true,
        sentimentComponents: true,
        sentimentUpdatedAt: true,
        sentimentLastFlipAt: true,
        updatedAt: true,
      },
      orderBy: { ticker: 'asc' },
    })

    const thresholdSeconds = resolveStalenessThreshold()
    const now = new Date()

    return ok(
      assets.map((a) => {
        const current = a.currentPrice.toNumber()
        const fv = a.fairValue.toNumber()
        const open = a.openPrice ? a.openPrice.toNumber() : current
        const staleness = classifySentimentStaleness(
          a.sentimentUpdatedAt,
          a.isHalted,
          thresholdSeconds,
          now
        )

        return {
          id: a.id,
          ticker: a.ticker,
          displayName: a.displayName,
          realName: a.realName ?? null,
          division: a.division,
          currentPrice: current,
          fairValue: fv,
          volume24h: Number(a.volume),
          priceChange:
            fv > 0
              ? Math.round(((current - fv) / fv) * 10000) / 100
              : 0,
          priceChange24h:
            open > 0
              ? Math.round(((current - open) / open) * 10000) / 100
              : 0,
          isHalted: a.isHalted,
          haltReason: a.haltReason ?? null,
          sentiment: a.sentiment,
          sentimentScore: a.sentimentScore ? Number(a.sentimentScore) : null,
          sentimentReason: a.sentimentReason ?? null,
          sentimentComponents: a.sentimentComponents ?? null,
          sentimentUpdatedAt: a.sentimentUpdatedAt?.toISOString() ?? null,
          sentimentLastFlipAt: a.sentimentLastFlipAt?.toISOString() ?? null,
          sentimentStaleness: staleness.state,
          sentimentAgeSeconds: staleness.ageSeconds,
          updatedAt: a.updatedAt.toISOString(),
        }
      })
    )
  } catch {
    return errors.server()
  }
}
