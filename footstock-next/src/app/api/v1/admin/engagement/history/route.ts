import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { EngagementDayPoint } from '@/lib/types/admin'

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

// GET /api/v1/admin/engagement/history?days=30 — Monitor+
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Permissão insuficiente para esta ação administrativa.' } },
      { status: 403 }
    )
  }

  const days = Math.min(
    90,
    Math.max(1, parseInt(request.nextUrl.searchParams.get('days') ?? '30', 10) || 30)
  )
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: since } },
      select: { userId: true, createdAt: true },
    })

    // Agrupar unique users por dia
    const dauMap = new Map<string, Set<string>>()
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      dauMap.set(toDateStr(d), new Set())
    }

    for (const order of orders) {
      const dayKey = toDateStr(order.createdAt)
      if (dauMap.has(dayKey)) {
        dauMap.get(dayKey)!.add(order.userId)
      }
    }

    // WAU: rolling 7d para cada dia
    const sortedDays = Array.from(dauMap.keys()).sort()
    const result: EngagementDayPoint[] = sortedDays.map((date, idx) => {
      const dau = dauMap.get(date)!.size
      // WAU: unique users nas últimas 7 entradas (simplificado)
      const wauStart = Math.max(0, idx - 6)
      const wauSet = new Set<string>()
      for (let k = wauStart; k <= idx; k++) {
        const dayUsers = dauMap.get(sortedDays[k])
        if (dayUsers) dayUsers.forEach((u) => wauSet.add(u))
      }
      return { date, dau, wau: wauSet.size }
    })

    return ok(result)
  } catch {
    return errors.server()
  }
}
