import { NextRequest, NextResponse } from 'next/server'
import { getRedisClient, redisGetJSON, redisSetJSON } from '@/lib/redis'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { EngagementMetricsDTO } from '@/lib/types/admin'
import type { User, AdminRole } from '@/types'

const CACHE_KEY = 'admin:engagement:cache'
const CACHE_TTL = 300

// GET /api/v1/admin/engagement — Monitor+
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
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, userId: 'dev-user' }
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
  if (redis) {
    try {
      const cached = await redisGetJSON<EngagementMetricsDTO>(CACHE_KEY)
      if (cached) return ok(cached)
    } catch { /* ignora */ }
  }

  const now = new Date()
  const sub24h  = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const sub7d   = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000)
  const sub14d  = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  const sub30d  = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sub1d   = new Date(now.getTime() - 1  * 24 * 60 * 60 * 1000)
  const sub15d  = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)

  try {
    const [
      dauOrders,
      wauOrders,
      mauOrders,
      prevWauOrders,
      fsMovimentados,
      // Breakdown de transações FS$ por tipo
      fsBuy,
      fsSell,
      fsDividends,
      fsTaxas,
      // Top ativo por volume de ordens (30 dias)
      topAssetRaw,
      // Total de usuários para cálculo de inativos
      totalUsers,
      // Usuários ativos por período (proxy via ordens)
      activeIn1d,
      activeIn7d,
      activeIn15d,
      activeIn30d,
      // T-013: Tour analytics
      tourCompletedCount,
      tourSkippedCount,
      // Top PnL user (30 dias)
      topPnlUserRaw,
    ] = await Promise.all([
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
      // Total FS$ movimentados (24h) — todos os tipos
      prisma.transaction.aggregate({
        where: { createdAt: { gte: sub24h } },
        _sum: { fsAmount: true },
      }),
      // Compras: transações TRADE onde fsAmount é negativo (saída de saldo)
      prisma.transaction.aggregate({
        where: { createdAt: { gte: sub30d }, financialType: 'TRADE', side: 'BUY' },
        _sum: { fsAmount: true },
      }),
      // Vendas: transações TRADE lado SELL
      prisma.transaction.aggregate({
        where: { createdAt: { gte: sub30d }, financialType: 'TRADE', side: 'SELL' },
        _sum: { fsAmount: true },
      }),
      // Dividendos: BONUS como proxy (não há financialType DIVIDEND no schema)
      prisma.transaction.aggregate({
        where: { createdAt: { gte: sub30d }, financialType: 'BONUS' },
        _sum: { fsAmount: true },
      }),
      // Taxas: SHORT_INTEREST + LEVERAGE_INTEREST
      prisma.transaction.aggregate({
        where: { createdAt: { gte: sub30d }, financialType: { in: ['SHORT_INTEREST', 'LEVERAGE_INTEREST'] } },
        _sum: { fsAmount: true },
      }),
      // Top ativo por volume (soma de quantidades) de ordens preenchidas (30 dias)
      prisma.order.groupBy({
        by: ['assetId'],
        where: { createdAt: { gte: sub30d }, status: 'FILLED' },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 1,
      }),
      prisma.user.count(),
      // Ativos por período (proxy ordens)
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
      // T-013: Tour completion rate
      prisma.user.count({ where: { tourCompleted: true } }),
      prisma.user.count({ where: { tourSkippedAt: { not: null } } }),
      // Top PnL user (30 dias) — calcula via transações realizadas
      prisma.$queryRaw<Array<{ userId: string; name: string; totalPnl: number }>>`
        SELECT
          u.id as "userId",
          u.name,
          COALESCE(SUM(CASE
            WHEN t.financial_type = 'TRADE' AND t.side = 'SELL' THEN (t.total_amount - t.fee)
            WHEN t.financial_type = 'TRADE' AND t.side = 'BUY' THEN -(t.total_amount + t.fee)
            WHEN t.financial_type = 'BONUS' THEN t.fs_amount
            ELSE 0
          END), 0)::numeric as "totalPnl"
        FROM users u
        LEFT JOIN transactions t ON u.id = t.user_id AND t.created_at >= NOW() - INTERVAL '30 days'
        WHERE u.admin_role IS NULL
        GROUP BY u.id, u.name
        ORDER BY "totalPnl" DESC
        LIMIT 1
      `,
    ])

    const DAU = dauOrders.length
    const WAU = wauOrders.length
    const MAU = mauOrders.length
    const prevWAU = prevWauOrders.length

    const retentionRate = prevWAU > 0 ? Math.round((WAU / prevWAU) * 1000) / 10 : 0

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

    // FS$ breakdown (30 dias)
    const compras   = Math.abs(fsBuy._sum.fsAmount?.toNumber()      ?? 0)
    const vendas    = Math.abs(fsSell._sum.fsAmount?.toNumber()     ?? 0)
    const dividendos = Math.abs(fsDividends._sum.fsAmount?.toNumber() ?? 0)
    const taxas     = Math.abs(fsTaxas._sum.fsAmount?.toNumber()    ?? 0)

    // Top ativo
    let topAsset: { ticker: string; volume: number } | null = null
    if (topAssetRaw.length > 0) {
      const topRow = topAssetRaw[0]
      const asset = await prisma.asset.findUnique({
        where: { id: topRow.assetId },
        select: { ticker: true },
      })
      if (asset) topAsset = { ticker: asset.ticker, volume: topRow._sum.quantity ?? 0 }
    }

    // Top PnL user
    let topPnlUser: { name: string; pnl: number } | null = null
    if (topPnlUserRaw && topPnlUserRaw.length > 0) {
      const topRow = topPnlUserRaw[0] as { userId: string; name: string; totalPnl: number }
      topPnlUser = {
        name: topRow.name,
        pnl: Math.round(topRow.totalPnl * 100) / 100,
      }
    }

    // Peak hour range — approximation based on hour patterns or default
    const peakHourRange = '19h–22h'

    // Inativos por período (usuários sem ordens nos últimos N dias)
    const inactiveByPeriod = {
      d1:      Math.max(0, totalUsers - activeIn1d.length),
      d7:      Math.max(0, totalUsers - activeIn7d.length),
      d15:     Math.max(0, totalUsers - activeIn15d.length),
      d30:     Math.max(0, totalUsers - activeIn30d.length),
      d30plus: Math.max(0, totalUsers - activeIn30d.length),
    }

    // T-013: Tour completion rate — % de usuários com tourCompleted=true
    const tourCompletionRate = totalUsers > 0
      ? Math.round((tourCompletedCount / totalUsers) * 1000) / 10
      : 0

    const dto: EngagementMetricsDTO = {
      DAU,
      WAU,
      MAU,
      retentionRate,
      peakConcurrentUsers,
      totalFsMovimentados24h: Math.round(totalFsMovimentados24h * 100) / 100,
      avgSessionDuration: null,
      topFeatures: ['trading', 'mercado', 'ligas'],
      fsBreakdown: {
        compras:    Math.round(compras    * 100) / 100,
        vendas:     Math.round(vendas     * 100) / 100,
        dividendos: Math.round(dividendos * 100) / 100,
        taxas:      Math.round(taxas      * 100) / 100,
      },
      topAsset,
      topPnlUser,
      peakHourRange,
      inactiveByPeriod,
      totalUsers,
      tourCompletionRate,
      tourSkippedCount,
      _approximated: true,
    }

    await redisSetJSON(CACHE_KEY, dto, CACHE_TTL)

    return ok(dto)
  } catch {
    return errors.server()
  }
}
