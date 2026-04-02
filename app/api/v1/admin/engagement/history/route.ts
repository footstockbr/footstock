// ============================================================================
// Foot Stock — GET /api/v1/admin/engagement/history?days=30
// Série temporal DAU/WAU. Max 90 dias. Requer: engagement:read.
// Rastreabilidade: INT-088, TASK-4/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import type { EngagementDayPoint } from '@/lib/types/admin'

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const GET = withAdmin('engagement:read')(async (request: NextRequest) => {
  const days = Math.min(
    90,
    Math.max(1, parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10) || 30)
  )
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: since } },
    select: { userId: true, createdAt: true },
  })

  const dauMap = new Map<string, Set<string>>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
    dauMap.set(toDateStr(d), new Set())
  }
  for (const order of orders) {
    const dayKey = toDateStr(order.createdAt)
    const existing = dauMap.get(dayKey)
    if (existing) existing.add(order.userId)
  }

  const sortedDays = Array.from(dauMap.keys()).sort()
  const result: EngagementDayPoint[] = sortedDays.map((date, idx) => {
    const dau = dauMap.get(date)?.size ?? 0
    const wauStart = Math.max(0, idx - 6)
    const wauSet = new Set<string>()
    for (let k = wauStart; k <= idx; k++) {
      const day = sortedDays[k]
      if (day) dauMap.get(day)?.forEach(u => wauSet.add(u))
    }
    return { date, dau, wau: wauSet.size }
  })

  return NextResponse.json({ data: result })
})
