import { NextResponse } from 'next/server'
import { getRedisClient, redisGetJSON, redisSetJSON } from '@/lib/redis'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { EngagementMetricsDTO } from '@/lib/types/admin'

const CACHE_KEY = 'admin:engagement:cache'
const CACHE_TTL = 300

// GET /api/v1/admin/engagement — Monitor+
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
  if (redis) {
    try {
      const cached = await redisGetJSON<EngagementMetricsDTO>(CACHE_KEY)
      if (cached) return ok(cached)
    } catch { /* ignora */ }
  }

  const now = new Date()
  const sub24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sub7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const sub14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const sub30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  try {
    const [dauOrders, wauOrders, mauOrders, prevWauOrders, fsMovimentados] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: { gte: sub24h } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: sub7d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: sub30d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: sub14d, lt: sub7d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.transaction.aggregate({
        where: { createdAt: { gte: sub24h } },
        _sum: { fsAmount: true },
      }),
    ])

    const DAU = dauOrders.length
    const WAU = wauOrders.length
    const MAU = mauOrders.length
    const prevWAU = prevWauOrders.length

    const retentionRate =
      prevWAU > 0 ? Math.round((WAU / prevWAU) * 1000) / 10 : 0

    // Peak concurrent: tenta Redis, fallback para MAU/30
    let peakConcurrentUsers = 0
    if (redis) {
      try {
        const peak = await redis.get('concurrent:sessions:peak')
        peakConcurrentUsers = peak ? parseInt(peak, 10) : Math.round(MAU / 30)
      } catch {
        peakConcurrentUsers = Math.round(MAU / 30)
      }
    } else {
      peakConcurrentUsers = Math.round(MAU / 30)
    }

    const totalFsMovimentados24h = fsMovimentados._sum.fsAmount?.toNumber() ?? 0

    const dto: EngagementMetricsDTO = {
      DAU,
      WAU,
      MAU,
      retentionRate,
      peakConcurrentUsers,
      totalFsMovimentados24h: Math.round(totalFsMovimentados24h * 100) / 100,
      avgSessionDuration: null,
      topFeatures: ['trading', 'mercado', 'ligas'],
      _approximated: true,
    }

    await redisSetJSON(CACHE_KEY, dto, CACHE_TTL)

    return ok(dto)
  } catch {
    return errors.server()
  }
}
