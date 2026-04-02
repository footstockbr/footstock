// ============================================================================
// Foot Stock — GET /api/v1/admin/assets
// Lista todos os ativos com status halt (Redis) e variação de preço.
// Requer: motor:read.
// Rastreabilidade: INT-086, TASK-3/ST006
// ============================================================================

import { NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'

export const GET = withAdmin('motor:read')(async () => {
  const [assets, haltKeys] = await Promise.all([
    prisma.asset.findMany({
      select: {
        id: true,
        ticker: true,
        name: true,
        division: true,
        currentPrice: true,
        openPrice: true,
      },
      orderBy: { ticker: 'asc' },
    }),
    redisPublisher.keys('motor:halt:*'),
  ])

  const haltedSet = new Set(haltKeys.map(k => k.replace('motor:halt:', '')))

  const data = assets.map(a => {
    const current = a.currentPrice.toNumber()
    const open = a.openPrice.toNumber()
    const priceChange = open > 0 ? Math.round(((current - open) / open) * 10000) / 100 : 0

    return {
      id: a.id,
      ticker: a.ticker,
      displayName: a.name,
      division: a.division as string,
      currentPrice: current,
      priceChange,
      isHalted: haltedSet.has(a.ticker),
      haltReason: null as string | null,
    }
  })

  return NextResponse.json({ data })
})
