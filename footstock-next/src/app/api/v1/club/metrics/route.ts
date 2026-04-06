// ============================================================================
// Foot Stock — GET /api/v1/club/metrics
// Retorna métricas agregadas e anonimizadas do clube autenticado.
// NUNCA expõe dados individuais de usuários (ADMIN_051).
// clubId extraído da sessão — nunca de query params (prevenção IDOR).
// Rastreabilidade: INT-084, US-025, US-036, TASK-2/ST001
// ============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClubContext } from '@/lib/auth/club-auth'
import { redisPublisher } from '@/lib/redis'
import { ERROR_CODES } from '@/lib/constants/errors'
import type { ClubMetricsData } from '@/types/club'

const CACHE_TTL_SECONDS = 900 // 15 minutos

export async function GET() {
  try {
    // ---------- Auth — clubId SEMPRE da sessão, nunca de query params ----------
    const clubContext = await getClubContext()

    if (!clubContext) {
      return NextResponse.json(
        { success: false, error: { code: 'ADMIN_050', message: 'Sem permissão de clube parceiro.' } },
        { status: 403 }
      )
    }

    const { clubId, userId } = clubContext

    // ---------- Cache Redis ----------
    const cacheKey = `club:metrics:${clubId}`
    try {
      const cached = await redisPublisher.get(cacheKey)
      if (cached) {
        return NextResponse.json({ success: true, data: JSON.parse(cached) })
      }
    } catch {
      // Redis indisponível — continuar sem cache
    }

    // ---------- Resolver assetId pelo ticker ----------
    const asset = await prisma.asset.findUnique({
      where: { ticker: clubId },
      select: { id: true, ticker: true, name: true, currentPrice: true },
    })

    if (!asset) {
      return NextResponse.json(
        { success: false, error: { code: ERROR_CODES.ASSET_051, message: 'Clube não encontrado.' } },
        { status: 404 }
      )
    }

    // Garantia IDOR: userId da sessão não é usado nas queries de métricas
    // (métricas são do clube, não do usuário autenticado)
    void userId

    // ---------- Queries de métricas agregadas ----------

    // Total de fãs: usuários únicos com posição aberta no ativo do clube
    const totalFansResult = await prisma.position.findMany({
      where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
      select: { userId: true },
      distinct: ['userId'],
    })
    const totalFans = totalFansResult.length

    // Fãs por plano: JOIN com users
    const fansByPlanRaw = await prisma.user.findMany({
      where: {
        positions: {
          some: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
        },
      },
      select: { planType: true },
    })

    const fansByPlan = {
      JOGADOR: fansByPlanRaw.filter((u) => u.planType === 'JOGADOR').length,
      CRAQUE: fansByPlanRaw.filter((u) => u.planType === 'CRAQUE').length,
      LENDA: fansByPlanRaw.filter((u) => u.planType === 'LENDA').length,
    }

    // Valor médio da carteira (posições abertas, usando currentPrice do asset)
    const openPositions = await prisma.position.findMany({
      where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
      select: { quantity: true },
    })

    const currentPriceNum = Number(asset.currentPrice)
    const portfolioValues = openPositions.map((p) => Number(p.quantity) * currentPriceNum)
    const avgPortfolioValue =
      portfolioValues.length > 0
        ? portfolioValues.reduce((a, b) => a + b, 0) / portfolioValues.length
        : 0

    // Total FS$ movimentado (soma do valor de face das ordens executadas)
    const fsVolumeResult = await prisma.order.aggregate({
      where: {
        assetId: asset.id,
        status: 'FILLED',
      },
      _sum: { quantity: true },
    })
    const totalFsMovimentado = Number(asset.currentPrice) * Number(fsVolumeResult._sum.quantity ?? 0)

    // Top 5 posições (anônimas — sem userId, sem email)
    const topPositionsRaw = await prisma.position.findMany({
      where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
      orderBy: { quantity: 'desc' },
      take: 5,
      select: { quantity: true }, // SEM userId, email, dados pessoais
    })
    const topPositions = topPositionsRaw.map((p, i) => ({
      quantityRank: i + 1,
      quantity: Number(p.quantity),
      anonymous: true as const,
    }))

    // Crescimento mensal de novos fãs (últimos 6 meses)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const monthlyRaw = await prisma.position.findMany({
      where: {
        assetId: asset.id,
        createdAt: { gte: sixMonthsAgo },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    })

    // Agrupar por YYYY-MM
    const monthlyMap = new Map<string, number>()
    for (const pos of monthlyRaw) {
      const key = pos.createdAt.toISOString().slice(0, 7)
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1)
    }
    const monthlyGrowth = Array.from(monthlyMap.entries()).map(([month, newFans]) => ({
      month,
      newFans,
    }))

    // ---------- Montar resposta ----------
    const responseData: ClubMetricsData = {
      clubId,
      totalFans,
      fansByPlan,
      totalFsMovimentado: Math.round(totalFsMovimentado * 100) / 100,
      avgPortfolioValue: Math.round(avgPortfolioValue * 100) / 100,
      topPositions,
      monthlyGrowth,
      leagueParticipation: 0, // feature futura — schema atual sem relação league-asset
    }

    // ---------- Cache Redis 15min ----------
    try {
      await redisPublisher.set(cacheKey, JSON.stringify(responseData), 'EX', CACHE_TTL_SECONDS)
    } catch {
      // Redis indisponível — responder sem cache
    }

    return NextResponse.json({ success: true, data: responseData })
  } catch (error) {
    console.error('[GET /api/v1/club/metrics] Erro:', error)
    return NextResponse.json(
      { success: false, error: { code: 'SYS-001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}
