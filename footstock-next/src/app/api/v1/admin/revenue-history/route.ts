import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { RevenueDayPoint } from '@/lib/types/admin'

const PLAN_PRICE: Record<string, number> = { CRAQUE: 19.9, LENDA: 39.9, JOGADOR: 0 }

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

// GET /api/v1/admin/revenue-history?days=30 — Monitor+
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
    // Subscrições criadas/renovadas no período
    const subs = await prisma.subscription.findMany({
      where: { createdAt: { gte: since }, status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { planType: true, createdAt: true },
    })

    // Acumular receita por dia
    const revenueByDay = new Map<string, number>()

    // Preencher todos os dias com 0
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      revenueByDay.set(toDateStr(d), 0)
    }

    for (const sub of subs) {
      const dayKey = toDateStr(sub.createdAt)
      if (revenueByDay.has(dayKey)) {
        revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + (PLAN_PRICE[sub.planType] ?? 0))
      }
    }

    const result: RevenueDayPoint[] = Array.from(revenueByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, mrr]) => ({ date, mrr: Math.round(mrr * 100) / 100 }))

    return ok(result)
  } catch {
    return errors.server()
  }
}
