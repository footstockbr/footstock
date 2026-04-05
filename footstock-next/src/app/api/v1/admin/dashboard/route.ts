import { NextResponse } from 'next/server'
import { getRedisClient, redisGetJSON, redisSetJSON } from '@/lib/redis'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { AdminDashboardDTO } from '@/lib/types/admin'

const CACHE_KEY = 'admin:dashboard:cache'
const CACHE_TTL = 60
const NSM_TARGET = 500
const PLAN_MRR: Record<string, number> = { CRAQUE: 19.9, LENDA: 39.9, JOGADOR: 0 }

// GET /api/v1/admin/dashboard — Monitor+
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
      { status: 403 }
    )
  }

  const redis = getRedisClient()

  // Tentar cache
  if (redis) {
    try {
      const cached = await redisGetJSON<AdminDashboardDTO>(CACHE_KEY)
      if (cached) {
        const res = NextResponse.json({ data: { ...cached, _cacheHit: true } })
        res.headers.set('X-Cache', 'HIT')
        return res
      }
    } catch { /* ignora falha de cache */ }
  }

  const now = new Date()
  const sub24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // Motor status via Redis
  let motorStatus: 'ONLINE' | 'OFFLINE' | 'DEGRADED' = 'DEGRADED'
  if (redis) {
    try {
      const ms = await redis.get('motor:status')
      if (ms === 'ONLINE' || ms === 'OFFLINE' || ms === 'DEGRADED') motorStatus = ms
    } catch { motorStatus = 'DEGRADED' }
  }

  try {
    const [
      totalUsers,
      newUsers24h,
      activeSubscriptions,
      totalOrders24h,
      topAssetsRaw,
      planCounts,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: sub24h } } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.order.count({ where: { createdAt: { gte: sub24h }, status: 'EXECUTED' } }),
      prisma.order.groupBy({
        by: ['ticker'],
        where: { createdAt: { gte: sub24h }, status: 'EXECUTED' },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.subscription.groupBy({
        by: ['planType'],
        where: { status: 'ACTIVE' },
        _count: { id: true },
      }),
    ])

    // MRR baseado em planos ativos
    const MRR = planCounts.reduce(
      (sum, row) => sum + (PLAN_MRR[row.planType] ?? 0) * row._count.id,
      0
    )

    // Top assets com variação de preço
    const topTickers = topAssetsRaw.map((r) => r.ticker)
    const assetPrices = await prisma.asset.findMany({
      where: { ticker: { in: topTickers } },
      select: { ticker: true, currentPrice: true, fairValue: true },
    })
    const priceMap = new Map(assetPrices.map((a) => [a.ticker, a]))
    const topAssets = topAssetsRaw.map((r) => {
      const asset = priceMap.get(r.ticker)
      const price = asset?.currentPrice.toNumber() ?? 0
      const fair = asset?.fairValue.toNumber() ?? price
      const priceChange = fair > 0 ? Math.round(((price - fair) / fair) * 10000) / 100 : 0
      return { ticker: r.ticker, volume: r._count.id, priceChange }
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

    await redisSetJSON(CACHE_KEY, dto, CACHE_TTL)

    const res = ok(dto)
    res.headers.set('X-Cache', 'MISS')
    return res
  } catch {
    return errors.server()
  }
}
