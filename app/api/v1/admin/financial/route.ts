// ============================================================================
// Foot Stock — GET /api/v1/admin/financial
// MRR, ARR, churn rate, novas assinaturas e distribuição por plano.
// Cache Redis 60s. Requer: financial:read.
// Rastreabilidade: INT-085
// ============================================================================

import { NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { redisPublisher } from '@/lib/redis'

const CACHE_TTL = 60 // segundos
// RESOLVED: MRR distingue assinantes mensais vs anuais (G005)
const PLAN_PRICE_MONTHLY: Record<string, number> = { CRAQUE: 19.9, LENDA: 39.9, JOGADOR: 0 }
const PLAN_PRICE_ANNUAL_MRR: Record<string, number> = { CRAQUE: 179.1 / 12, LENDA: 359.1 / 12, JOGADOR: 0 }
function getMrrContribution(planType: string, period: string): number {
  return period === 'ANNUAL' ? (PLAN_PRICE_ANNUAL_MRR[planType] ?? 0) : (PLAN_PRICE_MONTHLY[planType] ?? 0)
}

export interface FinancialMetricsDTO {
  mrr: number
  arr: number
  churnRate: number
  activeSubscriptions: number
  newSubscriptions24h: number
  cancelledThisMonth: number
  cancelledPrevMonth: number
  planDistribution: { plan: string; count: number; mrr: number }[]
}

export const GET = withAdmin('financial:read')(async (_request, { user }) => {
  const cacheKey = `admin:financial:cache:${user.adminRole}`

  try {
    const cached = await redisPublisher.get(cacheKey)
    if (cached) {
      const dto = JSON.parse(cached) as FinancialMetricsDTO
      const res = NextResponse.json({ data: { ...dto, _cacheHit: true } })
      res.headers.set('X-Cache', 'HIT')
      return res
    }
  } catch { /* ignora falha de cache */ }

  const now = new Date()
  const sub24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // Primeiro dia do mes atual e anterior
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

  const [
    planCountsRaw,
    newSubscriptions24h,
    cancelledThisMonth,
    cancelledPrevMonth,
    activeAtStartOfMonth,
  ] = await Promise.all([
    // Contagem por plano + period (ativos) — distingue mensal/anual para MRR correto
    prisma.subscription.groupBy({
      by: ['planType', 'period'],
      where: { status: 'ACTIVE', user: { adminRole: null } },
      _count: { id: true },
    }),
    // Novas assinaturas nas ultimas 24h
    prisma.subscription.count({
      where: {
        createdAt: { gte: sub24h },
        status: { in: ['ACTIVE', 'TRIAL'] },
        user: { adminRole: null },
      },
    }),
    // Cancelamentos no mes atual
    prisma.subscription.count({
      where: {
        cancelledAt: { gte: startOfThisMonth },
        status: 'CANCELLED',
        user: { adminRole: null },
      },
    }),
    // Cancelamentos no mes anterior
    prisma.subscription.count({
      where: {
        cancelledAt: { gte: startOfPrevMonth, lte: endOfPrevMonth },
        status: 'CANCELLED',
        user: { adminRole: null },
      },
    }),
    // Total ativo no inicio do mes (para base do churn)
    prisma.subscription.count({
      where: {
        createdAt: { lt: startOfThisMonth },
        status: { in: ['ACTIVE', 'CANCELLED'] },
        user: { adminRole: null },
      },
    }),
  ])

  const mrr = planCountsRaw.reduce(
    (sum, row) => sum + getMrrContribution(row.planType, row.period) * row._count.id,
    0
  )
  const arr = mrr * 12

  const churnBase = Math.max(activeAtStartOfMonth, 1)
  const churnRate = Math.round((cancelledThisMonth / churnBase) * 10000) / 100

  const activeSubscriptions = planCountsRaw.reduce((s, r) => s + r._count.id, 0)

  // Agrupar planDistribution por planType (somar mensal + anual)
  const planDistributionMap = new Map<string, { count: number; mrr: number }>()
  for (const row of planCountsRaw) {
    const existing = planDistributionMap.get(row.planType) ?? { count: 0, mrr: 0 }
    planDistributionMap.set(row.planType, {
      count: existing.count + row._count.id,
      mrr: existing.mrr + getMrrContribution(row.planType, row.period) * row._count.id,
    })
  }
  const planDistribution = Array.from(planDistributionMap.entries()).map(([plan, data]) => ({
    plan,
    count: data.count,
    mrr: Math.round(data.mrr * 100) / 100,
  }))

  const dto: FinancialMetricsDTO = {
    mrr: Math.round(mrr * 100) / 100,
    arr: Math.round(arr * 100) / 100,
    churnRate,
    activeSubscriptions,
    newSubscriptions24h,
    cancelledThisMonth,
    cancelledPrevMonth,
    planDistribution,
  }

  try {
    await redisPublisher.setex(cacheKey, CACHE_TTL, JSON.stringify(dto))
  } catch { /* ignora falha de cache write */ }

  const res = NextResponse.json({ data: dto })
  res.headers.set('X-Cache', 'MISS')
  return res
})
