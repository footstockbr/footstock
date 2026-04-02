// ============================================================================
// Foot Stock — GET /api/v1/admin/dashboard
// KPIs consolidados: usuários, MRR, ordens 24h, status motor, top ativos.
// Cache Redis 60s. Requer: admin:dashboard.
// Rastreabilidade: INT-085, TASK-2/ST001
// ============================================================================

import { NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'
import { canAccess } from '@/lib/auth/canAccess'
import type { AdminDashboardDTO, MotorStatus } from '@/lib/types/admin'

const CACHE_TTL = 60 // segundos
const NSM_TARGET = 500
// RESOLVED: MRR distingue assinantes mensais vs anuais (G005)
const PLAN_MRR_MONTHLY: Record<string, number> = { CRAQUE: 19.9, LENDA: 39.9, JOGADOR: 0 }
const PLAN_MRR_ANNUAL: Record<string, number> = { CRAQUE: 179.1 / 12, LENDA: 359.1 / 12, JOGADOR: 0 }
function getMrrContribution(planType: string, period: string): number {
  return period === 'ANNUAL' ? (PLAN_MRR_ANNUAL[planType] ?? 0) : (PLAN_MRR_MONTHLY[planType] ?? 0)
}

async function getMotorStatus(): Promise<MotorStatus> {
  try {
    const ms = await redisPublisher.get('motor:status')
    if (ms === 'ONLINE' || ms === 'OFFLINE' || ms === 'DEGRADED') return ms
    return 'DEGRADED'
  } catch {
    return 'DEGRADED'
  }
}

export const GET = withAdmin('admin:dashboard')(async (_request, { user }) => {
  const role = user.adminRole
  const cacheKey = `admin:dashboard:cache:${role}`
  // withAdmin already validates adminRole is not null; safe to assert
  const canReadUsers = role ? canAccess(role, 'users:read') : false
  const canReadFinancial = role ? canAccess(role, 'financial:read') : false
  const canReadMotor = role ? canAccess(role, 'motor:read') : false

  // Tentar cache Redis
  try {
    const cached = await redisPublisher.get(cacheKey)
    if (cached) {
      const dto = JSON.parse(cached) as AdminDashboardDTO
      const res = NextResponse.json({ data: { ...dto, _cacheHit: true } })
      res.headers.set('X-Cache', 'HIT')
      return res
    }
  } catch { /* ignora falha de cache */ }

  const now = new Date()
  const sub24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [
    motorStatus,
    totalUsers,
    newUsers24h,
    activeSubscriptionsRaw,
    totalOrders24h,
    topAssetsRaw,
    planCountsRaw,
  ] = await Promise.all([
    canReadMotor ? getMotorStatus() : Promise.resolve<MotorStatus>('DEGRADED'),
    canReadUsers ? prisma.user.count() : Promise.resolve(0),
    canReadUsers ? prisma.user.count({ where: { createdAt: { gte: sub24h } } }) : Promise.resolve(0),
    canReadFinancial
      ? prisma.subscription.count({
          where: { status: 'ACTIVE', user: { adminRole: null } },
        })
      : Promise.resolve(0),
    prisma.order.count({ where: { createdAt: { gte: sub24h }, status: 'FILLED' } }),
    prisma.order.groupBy({
      by: ['assetId'],
      where: { createdAt: { gte: sub24h }, status: 'FILLED' },
      _count: { assetId: true },
      orderBy: { _count: { assetId: 'desc' } },
      take: 5,
    }),
    canReadFinancial
      ? prisma.subscription.groupBy({
          by: ['planType', 'period'],
          where: { status: 'ACTIVE', user: { adminRole: null } },
          _count: { id: true },
        })
      : Promise.resolve([]),
  ])

  const activeSubscriptions = canReadFinancial ? activeSubscriptionsRaw : 0
  const planCounts = canReadFinancial ? planCountsRaw : []

  const MRR = planCounts.reduce(
    (sum, row) => sum + getMrrContribution(row.planType, row.period) * row._count.id,
    0
  )

  // Enriquecer top ativos com ticker e variação
  const topAssetIds = topAssetsRaw.map(r => r.assetId)
  const assetDetails = await prisma.asset.findMany({
    where: { id: { in: topAssetIds } },
    select: { id: true, ticker: true, currentPrice: true, openPrice: true },
  })
  const assetMap = new Map(assetDetails.map(a => [a.id, a]))

  const topAssets = topAssetsRaw.map(r => {
    const asset = assetMap.get(r.assetId)
    const current = asset?.currentPrice.toNumber() ?? 0
    const open = asset?.openPrice.toNumber() ?? current
    const priceChange = open > 0 ? Math.round(((current - open) / open) * 10000) / 100 : 0
    const volume = r._count.assetId
    return { ticker: asset?.ticker ?? r.assetId, volume, priceChange }
  })

  const dto: AdminDashboardDTO = {
    totalUsers,
    newUsers24h,
    activeSubscriptions,
    MRR: Math.round(MRR * 100) / 100,
    totalOrders24h,
    ordersVsTarget: {
      today: totalOrders24h,
      target: NSM_TARGET,
      percentAchieved: Math.round(Math.min((totalOrders24h / NSM_TARGET) * 100, 100) * 10) / 10,
    },
    motorStatus,
    topAssets,
  }

  try {
    await redisPublisher.setex(cacheKey, CACHE_TTL, JSON.stringify(dto))
  } catch { /* ignora falha de cache write */ }

  const res = NextResponse.json({ data: dto })
  res.headers.set('X-Cache', 'MISS')
  return res
})
