import { NextResponse, NextRequest } from 'next/server'
import { getRedisClient, redisGetJSON, redisSetJSON } from '@/lib/redis'
import { getAuthUser, hasAdminRole, serializeUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { AdminDashboardDTO } from '@/lib/types/admin'
import type { User, AdminRole } from '@/types'

const CACHE_KEY = 'admin:dashboard:cache'
const CACHE_TTL = 60
const NSM_TARGET = 500
const PLAN_MRR: Record<string, number> = { CRAQUE: 19.9, LENDA: 39.9, JOGADOR: 0 }

// GET /api/v1/admin/dashboard — Monitor+
export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  // Dev mode fallback: accept fs-admin-role cookie
  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      // Create dummy user for dev
      const dummyUser: User = {
        id: 'dev-user',
        email: 'dev@foot-stock.test',
        name: 'Dev User',
        phone: null,
        birthDate: '',
        favoriteClub: '',
        favoriteClubDisplayName: null,
        userType: 'NORMAL',
        investorProfile: 'INICIANTE',
        planType: 'JOGADOR',
        fsBalance: 0,
        marginBlocked: 0,
        tourCompleted: false,
        ageVerificationPending: false,
        adminRole: adminRole as AdminRole,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

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
  const sub24h  = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sub1d   = new Date(now.getTime() - 1  * 24 * 60 * 60 * 1000)
  const sub7d   = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)
  const sub15d  = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
  const sub30d  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

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
      suspendedCount,
      postsPendingModeration,
      // Usuários inativos por período — baseado em último acesso via Order
      // Usuários sem nenhuma ordem nos períodos definidos (proxy de atividade)
      activeIn1d,
      activeIn7d,
      activeIn15d,
      activeIn30d,
      // Distribuição por plano (todos os usuários)
      planDistRaw,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: sub24h } } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.order.count({ where: { createdAt: { gte: sub24h }, status: 'FILLED' } }),
      prisma.order.groupBy({
        by: ['assetId'],
        where: { createdAt: { gte: sub24h }, status: 'FILLED' },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.subscription.groupBy({
        by: ['planType'],
        where: { status: 'ACTIVE' },
        _count: { id: true },
      }),
      // Usuários suspensos
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      // Posts sinalizados aguardando moderação
      prisma.globalForumPost.count({ where: { isFlagged: true, isDeleted: false } }),
      // Usuários com atividade (qualquer ordem) nos últimos N dias (para calcular inativos por exclusão)
      prisma.order.findMany({
        where: { createdAt: { gte: sub1d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: sub7d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: sub15d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.order.findMany({
        where: { createdAt: { gte: sub30d } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      // Distribuição de planos de todos os usuários
      prisma.user.groupBy({
        by: ['planType'],
        _count: { id: true },
      }),
    ])

    // MRR baseado em planos ativos
    const MRR = planCounts.reduce(
      (sum, row) => sum + (PLAN_MRR[row.planType] ?? 0) * row._count.id,
      0
    )

    // Top assets com variação de preço
    const topAssetIds = topAssetsRaw.map((r) => r.assetId)
    const assetPrices = await prisma.asset.findMany({
      where: { id: { in: topAssetIds } },
      select: { id: true, ticker: true, currentPrice: true, fairValue: true },
    })
    const priceMap = new Map(assetPrices.map((a) => [a.id, a]))
    const topAssets = topAssetsRaw.map((r) => {
      const asset = priceMap.get(r.assetId)
      const price = asset?.currentPrice.toNumber() ?? 0
      const fair = asset?.fairValue.toNumber() ?? price
      const priceChange = fair > 0 ? Math.round(((price - fair) / fair) * 10000) / 100 : 0
      return { ticker: asset?.ticker ?? r.assetId, volume: r._count.id, priceChange }
    })

    // Contagem de usuários online (ativos nos últimos 5 minutos via Redis ou estimativa por DAU)
    let onlineUsers = 0
    if (redis) {
      try {
        const onlineKey = await redis.scard('online:users')
        onlineUsers = onlineKey ?? 0
      } catch { onlineUsers = 0 }
    }

    // Conjuntos de usuários ativos
    const activeIn1dSet  = new Set(activeIn1d.map((r) => r.userId))
    const activeIn7dSet  = new Set(activeIn7d.map((r) => r.userId))
    const activeIn15dSet = new Set(activeIn15d.map((r) => r.userId))
    const activeIn30dSet = new Set(activeIn30d.map((r) => r.userId))

    // Inativos por período: usuários que NÃO tiveram atividade no período
    // (estimativa conservadora — proxied via orders)
    const inactiveD1     = Math.max(0, totalUsers - activeIn1dSet.size)
    const inactiveD7     = Math.max(0, totalUsers - activeIn7dSet.size)
    const inactiveD15    = Math.max(0, totalUsers - activeIn15dSet.size)
    const inactiveD30    = Math.max(0, totalUsers - activeIn30dSet.size)
    // +30d: inativos há mais de 30 dias (subconjunto dos inativos em 30d)
    const inactiveD30plus = inactiveD30

    // Distribuição de planos (todos os usuários cadastrados)
    const planOrder = ['JOGADOR', 'CRAQUE', 'LENDA']
    const planDistribution = planOrder.map((plan) => {
      const row = planDistRaw.find((r) => r.planType === plan)
      const count = row?._count.id ?? 0
      const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 1000) / 10 : 0
      return { plan, count, pct }
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
      userStats: {
        online: onlineUsers,
        suspended: suspendedCount,
        postsPendingModeration,
        inactiveByPeriod: {
          d1:      inactiveD1,
          d7:      inactiveD7,
          d15:     inactiveD15,
          d30:     inactiveD30,
          d30plus: inactiveD30plus,
        },
        planDistribution,
      },
    }

    await redisSetJSON(CACHE_KEY, dto, CACHE_TTL)

    const res = ok(dto)
    res.headers.set('X-Cache', 'MISS')
    return res
  } catch {
    return errors.server()
  }
}
