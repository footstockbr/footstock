// ============================================================================
// FootStock — GET /api/v1/subscriptions/history
// Histórico de assinaturas e pagamentos do usuário autenticado
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

async function getHandler(_req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const subscriptions = await prisma.subscription.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      planType: true,
      gateway: true,
      period: true,
      amount: true,
      status: true,
      startsAt: true,
      expiresAt: true,
      cancelledAt: true,
      createdAt: true,
      payments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          status: true,
          gatewayTransactionId: true,
          createdAt: true,
        },
      },
    },
  })

  return NextResponse.json({
    success: true,
    data: subscriptions.map((sub) => ({
      id: sub.id,
      planType: sub.planType,
      gateway: sub.gateway,
      period: sub.period,
      amountBRL: (sub.amount / 100).toFixed(2),
      status: sub.status,
      startsAt: sub.startsAt,
      expiresAt: sub.expiresAt,
      cancelledAt: sub.cancelledAt ?? null,
      createdAt: sub.createdAt,
      payments: sub.payments.map((p) => ({
        id: p.id,
        amountBRL: (Number(p.amount) / 100).toFixed(2),
        status: p.status,
        transactionId: p.gatewayTransactionId ?? null,
        paidAt: p.createdAt,
      })),
    })),
  })
}

export const GET = withAuth(getHandler)
