import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { RevenueDayPoint } from '@/lib/types/admin'
import type { User, AdminRole } from '@/types'

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10)
}

// GET /api/v1/admin/revenue-history?days=30 — Administrador+ (financial:read)
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
  // Receita é dado financeiro: matriz RBAC (canAccess.ts) concede financial:read
  // apenas a ADMINISTRADOR+ — MONITOR não deve ver receita.
  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
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
    // Subscrições criadas/renovadas no período.
    // FIX-12: usar Subscription.amount (centavos cobrados de fato), nunca preço
    // hardcoded — garante que a série histórica bata com o valor real cobrado.
    const subs = await prisma.subscription.findMany({
      where: { createdAt: { gte: since }, status: { in: ['ACTIVE', 'TRIAL'] } },
      select: { amount: true, createdAt: true },
    })

    // Acumular receita por dia (em centavos)
    const revenueByDay = new Map<string, number>()

    // Preencher todos os dias com 0
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      revenueByDay.set(toDateStr(d), 0)
    }

    for (const sub of subs) {
      const dayKey = toDateStr(sub.createdAt)
      if (revenueByDay.has(dayKey)) {
        revenueByDay.set(dayKey, (revenueByDay.get(dayKey) ?? 0) + (sub.amount ?? 0))
      }
    }

    const result: RevenueDayPoint[] = Array.from(revenueByDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cents]) => ({ date, mrr: Math.round(cents) / 100 }))

    return ok(result)
  } catch {
    return errors.server()
  }
}
