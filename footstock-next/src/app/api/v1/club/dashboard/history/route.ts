// ============================================================================
// FootStock — GET /api/v1/club/dashboard/history
// Série histórica de fansByPlan e currentPrice para o clube autenticado.
// Período default: 30d. Dados SEMPRE agregados (ADMIN_051).
// Rastreabilidade: TASK-015 sub-item 3, US-025
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClubContext } from '@/lib/auth/club-auth'
import { redisPublisher } from '@/lib/redis'
import type { ClubDashboardHistory } from '@/types/club'

const CACHE_TTL_SECONDS = 900 // 15 minutos

export async function GET(request: NextRequest) {
  try {
    const clubContext = await getClubContext()
    if (!clubContext) {
      return NextResponse.json(
        { success: false, error: { code: 'ADMIN_050', message: 'Sem permissão de clube parceiro.' } },
        { status: 403 }
      )
    }

    const { clubId } = clubContext
    const { searchParams } = new URL(request.url)
    const periodParam = searchParams.get('period') ?? '30d'

    // Parse period (suporta 7d, 30d, 90d)
    const daysMatch = periodParam.match(/^(\d+)d$/)
    const days = daysMatch ? Math.min(Number(daysMatch[1]), 90) : 30

    // Cache
    const cacheKey = `club:history:${clubId}:${days}d`
    try {
      const cached = await redisPublisher.get(cacheKey)
      if (cached) {
        return NextResponse.json({ success: true, data: JSON.parse(cached) })
      }
    } catch { /* sem cache */ }

    const asset = await prisma.asset.findUnique({
      where: { ticker: clubId },
      select: { id: true },
    })

    if (!asset) {
      return NextResponse.json(
        { success: false, error: { code: 'CLUB_002', message: 'Clube não encontrado.' } },
        { status: 404 }
      )
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // ── Histórico de preços ────────────────────────────────────────────
    const priceHistoryRaw = await prisma.priceHistory.findMany({
      where: {
        assetId: asset.id,
        timestamp: { gte: startDate },
      },
      select: { timestamp: true, close: true },
      orderBy: { timestamp: 'asc' },
    })

    // Agrupar por dia (pegar último close de cada dia)
    const priceByDay = new Map<string, number>()
    for (const ph of priceHistoryRaw) {
      const day = ph.timestamp.toISOString().slice(0, 10)
      priceByDay.set(day, Number(ph.close))
    }
    const priceHistory = Array.from(priceByDay.entries()).map(([date, price]) => ({
      date,
      price: Math.round(price * 100) / 100,
    }))

    // ── Histórico de fãs por plano (por mês) ─────────────────────────
    const positionsInPeriod = await prisma.position.findMany({
      where: {
        assetId: asset.id,
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        user: { select: { planType: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    const fansByMonthMap = new Map<string, { jogador: number; craque: number; lenda: number }>()
    for (const pos of positionsInPeriod) {
      const month = pos.createdAt.toISOString().slice(0, 7)
      const entry = fansByMonthMap.get(month) ?? { jogador: 0, craque: 0, lenda: 0 }
      switch (pos.user.planType) {
        case 'JOGADOR': entry.jogador++; break
        case 'CRAQUE': entry.craque++; break
        case 'LENDA': entry.lenda++; break
      }
      fansByMonthMap.set(month, entry)
    }

    const fansByPlan = Array.from(fansByMonthMap.entries()).map(([month, data]) => ({
      month,
      ...data,
    }))

    const responseData: ClubDashboardHistory = {
      period: `${days}d`,
      fansByPlan,
      priceHistory,
    }

    // Cache
    try {
      await redisPublisher.set(cacheKey, JSON.stringify(responseData), 'EX', CACHE_TTL_SECONDS)
    } catch { /* sem cache */ }

    return NextResponse.json({ success: true, data: responseData })
  } catch (error) {
    console.error('[GET /api/v1/club/dashboard/history] Erro:', error)
    return NextResponse.json(
      { success: false, error: { code: 'SYS-001', message: 'Erro interno do servidor.' } },
      { status: 500 }
    )
  }
}
