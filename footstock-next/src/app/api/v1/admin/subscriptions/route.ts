// ============================================================================
// Foot Stock — GET /api/v1/admin/subscriptions
// Métricas de assinaturas: contagem por status, renovações agendadas, coorte.
// RESOLVED: G004 — endpoint criado para sub-aba Assinaturas do módulo Financeiro
// ============================================================================

import { NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

export const GET = withAdmin('financial:read')(async () => {
  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [statusCounts, renewingSoon, cohortRaw] = await Promise.all([
    // Contagem por status
    prisma.subscription.groupBy({
      by: ['status'],
      where: { user: { adminRole: null } },
      _count: { id: true },
    }),

    // Renovações agendadas (ACTIVE com expiresAt nos próximos 7 dias)
    prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { gte: now, lte: in7Days },
        user: { adminRole: null },
      },
      select: {
        id: true,
        planType: true,
        period: true,
        expiresAt: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { expiresAt: 'asc' },
      take: 50,
    }),

    // Coorte: usuários criados por mês vs conversão para planos pagos
    prisma.$queryRaw<{ month: string; total: number; converted: number }[]>`
      SELECT
        TO_CHAR(u.created_at, 'YYYY-MM') AS month,
        COUNT(*)::int                    AS total,
        COUNT(CASE WHEN u.plan_type IN ('CRAQUE', 'LENDA') THEN 1 END)::int AS converted
      FROM users u
      WHERE u.admin_role IS NULL
        AND u.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY TO_CHAR(u.created_at, 'YYYY-MM')
      ORDER BY month ASC
    `,
  ])

  const byStatus = Object.fromEntries(
    statusCounts.map(r => [r.status, r._count.id])
  )

  const renewals = renewingSoon.map(s => ({
    id: s.id,
    planType: s.planType,
    period: s.period,
    expiresAt: s.expiresAt,
    userName: s.user.name,
    userEmail: s.user.email,
  }))

  return NextResponse.json({
    data: {
      byStatus: {
        ACTIVE:        byStatus['ACTIVE']        ?? 0,
        SUSPENDED:     byStatus['SUSPENDED']      ?? 0,
        CANCELLED:     byStatus['CANCELLED']      ?? 0,
        TRIAL_PERIOD:  byStatus['TRIAL_PERIOD']   ?? 0,
      },
      renewingSoon: renewals,
      cohort: cohortRaw.map(r => ({
        month:     r.month,
        total:     Number(r.total),
        converted: Number(r.converted),
        rate:      r.total > 0 ? Math.round((Number(r.converted) / Number(r.total)) * 100) : 0,
      })),
    },
  })
})
