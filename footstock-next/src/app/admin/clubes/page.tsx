import type { Metadata } from 'next'
import { Trophy } from 'lucide-react'
import { prisma } from '@/lib/prisma'
import AdminClubesClient, { type AssetRow } from './AdminClubesClient'

export const metadata: Metadata = {
  title: 'Clubes — Admin · Foot Stock',
}

export default async function AdminClubesPage() {
  const assets = await prisma.asset.findMany({
    orderBy: [{ division: 'asc' }, { currentPrice: 'desc' }],
  })

  // Count distinct holders (users with OPEN positions) per asset
  const holderCounts = await prisma.position.groupBy({
    by: ['assetId'],
    where: { status: 'OPEN' },
    _count: { userId: true },
  })
  const holdersMap = new Map(holderCounts.map((h) => [h.assetId, h._count.userId]))

  // Serialize: Decimal → number, BigInt → number (required for client component)
  const rows: AssetRow[] = assets.map((asset) => ({
    id: asset.id,
    ticker: asset.ticker,
    displayName: asset.displayName,
    division: asset.division,
    currentPrice: asset.currentPrice.toNumber(),
    openPrice: asset.openPrice.toNumber(),
    currentSupply: Number(asset.currentSupply),
    holders: holdersMap.get(asset.id) ?? 0,
  }))

  return (
    <div className="p-6" data-testid="page-admin-clubes">
      <div className="flex items-center justify-between mb-6" data-testid="admin-clubes-header">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF] flex items-center gap-2">
            <Trophy className="h-5 w-5 text-[#F0B90B]" />
            Clubes
          </h1>
          <p className="text-sm text-[#929AA5]">
            {rows.length} clubes · gestão de ativos e supply
          </p>
        </div>
      </div>

      <AdminClubesClient initialAssets={rows} />
    </div>
  )
}
