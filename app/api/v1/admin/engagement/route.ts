// ============================================================================
// Foot Stock — GET /api/v1/admin/engagement
// Métricas de engajamento: DAU/WAU/MAU, retenção, FS movimentados.
// Cache Redis 5min. Requer: engagement:read.
// Rastreabilidade: INT-088, TASK-4/ST001
// ============================================================================

import { NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'
import type { EngagementMetricsDTO } from '@/lib/types/admin'

const CACHE_KEY = 'admin:engagement:cache'
const CACHE_TTL = 300 // 5 minutos

export const GET = withAdmin('engagement:read')(async () => {
  // Cache Redis
  try {
    const cached = await redisPublisher.get(CACHE_KEY)
    if (cached) {
      return NextResponse.json({ data: JSON.parse(cached) })
    }
  } catch { /* ignora */ }

  const now = new Date()
  const sub24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sub7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const sub14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const sub30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

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
  const retentionRate = prevWAU > 0 ? Math.round((WAU / prevWAU) * 1000) / 10 : 0

  let peakConcurrentUsers = 0
  try {
    const peak = await redisPublisher.get('concurrent:sessions:peak')
    peakConcurrentUsers = peak ? parseInt(peak, 10) : Math.round(MAU / 30)
  } catch {
    peakConcurrentUsers = Math.round(MAU / 30)
  }

  const dto: EngagementMetricsDTO = {
    DAU,
    WAU,
    MAU,
    retentionRate,
    peakConcurrentUsers,
    totalFsMovimentados24h: Math.round((fsMovimentados._sum?.fsAmount?.toNumber() ?? 0) * 100) / 100,
    avgSessionDuration: null,
    topFeatures: ['trading', 'mercado', 'ligas'],
    _approximated: true,
  }

  try {
    await redisPublisher.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(dto))
  } catch { /* ignora */ }

  return NextResponse.json({ data: dto })
})
