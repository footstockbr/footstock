// ============================================================================
// Foot Stock — GET /api/v1/admin/revenue-history?days=30
// Série temporal de MRR diário. Max 90 dias. Requer: financial:read.
// Rastreabilidade: INT-085, TASK-2/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import type { RevenueDayPoint } from '@/lib/types/admin'

// RESOLVED: MRR distingue assinantes mensais vs anuais (G005)
const PLAN_PRICE_MONTHLY: Record<string, number> = { CRAQUE: 19.9, LENDA: 39.9, JOGADOR: 0 }
const PLAN_PRICE_ANNUAL_MRR: Record<string, number> = { CRAQUE: 179.1 / 12, LENDA: 359.1 / 12, JOGADOR: 0 }
function getMrrContribution(planType: string, period: string): number {
  return period === 'ANNUAL' ? (PLAN_PRICE_ANNUAL_MRR[planType] ?? 0) : (PLAN_PRICE_MONTHLY[planType] ?? 0)
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const GET = withAdmin('financial:read')(async (request: NextRequest) => {
  const days = Math.min(
    90,
    Math.max(1, parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10) || 30)
  )

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const subs = await prisma.subscription.findMany({
    where: {
      createdAt: { gte: since },
      status: { in: ['ACTIVE', 'TRIAL'] },
      user: { adminRole: null },
    },
    select: { planType: true, period: true, createdAt: true },
  })

  const revenueByDay = new Map<string, number>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    revenueByDay.set(toDateStr(d), 0)
  }
  for (const sub of subs) {
    const dayKey = toDateStr(sub.createdAt)
    if (revenueByDay.has(dayKey)) {
      revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + getMrrContribution(sub.planType, sub.period))
    }
  }

  const result: RevenueDayPoint[] = Array.from(revenueByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, mrr]) => ({ date, mrr: Math.round(mrr * 100) / 100 }))

  return NextResponse.json({ data: result })
})
