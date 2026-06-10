/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * DEV ONLY: Seed financial data for dashboard testing
 * POST /api/v1/dev/seed-financial
 *
 * Creates:
 * - 3 LENDA subscriptions
 * - 4 CRAQUE subscriptions
 * - 5+ payments across different gateways
 */
export async function POST(request: Request) {
  // Bloquear em produção
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is only available in development' },
      { status: 403 }
    )
  }

  // Mesmo fora de produção (staging/local), exigir segredo — sem isto qualquer
  // visitante anônimo poderia semear dados financeiros arbitrários.
  const secret = process.env.SEED_SECRET ?? process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    // Obter primeiro usuário
    const user = await prisma.user.findFirst()
    if (!user) {
      return NextResponse.json(
        { error: 'No user found. Create a user first.' },
        { status: 400 }
      )
    }

    const now = new Date('2026-04-09')
    const monthStart = new Date(2026, 3, 1) // 1º de abril
    const today = now.toISOString().split('T')[0]

    const PLAN_PRICES: Record<string, number> = {
      JOGADOR: 0,
      CRAQUE: 200,
      LENDA: 300,
    }

    const GATEWAYS = ['stripe', 'mercadopago', 'pix', 'paypal', 'pagseguro']

    // 1. Criar 3 LENDA
    for (let i = 0; i < 3; i++) {
      const expiresAt = new Date(now)
      expiresAt.setMonth(expiresAt.getMonth() + 1)

      const sub = await prisma.subscription.upsert({
        where: { id: `sub-lenda-${i + 1}` },
        update: {},
        create: {
          id: `sub-lenda-${i + 1}`,
          userId: user.id,
          planType: 'LENDA',
          gateway: GATEWAYS[i % GATEWAYS.length] as any,
          period: 'MONTHLY',
          amount: PLAN_PRICES.LENDA,
          status: 'ACTIVE',
          startsAt: monthStart,
          expiresAt,
        },
      })

      await prisma.payment.upsert({
        where: { id: `pay-lenda-${i + 1}` },
        update: {},
        create: {
          id: `pay-lenda-${i + 1}`,
          userId: user.id,
          subscriptionId: sub.id,
          amount: PLAN_PRICES.LENDA,
          gateway: sub.gateway,
          gatewayTransactionId: `lenda-tx-${i + 1}-${today}`,
          status: 'PAID',
          processedAt: now,
        },
      })
    }

    // 2. Criar 4 CRAQUE
    for (let i = 0; i < 4; i++) {
      const expiresAt = new Date(now)
      expiresAt.setMonth(expiresAt.getMonth() + 1)

      const sub = await prisma.subscription.upsert({
        where: { id: `sub-craque-${i + 1}` },
        update: {},
        create: {
          id: `sub-craque-${i + 1}`,
          userId: user.id,
          planType: 'CRAQUE',
          gateway: GATEWAYS[i % GATEWAYS.length] as any,
          period: 'MONTHLY',
          amount: PLAN_PRICES.CRAQUE,
          status: 'ACTIVE',
          startsAt: monthStart,
          expiresAt,
        },
      })

      await prisma.payment.upsert({
        where: { id: `pay-craque-${i + 1}` },
        update: {},
        create: {
          id: `pay-craque-${i + 1}`,
          userId: user.id,
          subscriptionId: sub.id,
          amount: PLAN_PRICES.CRAQUE,
          gateway: sub.gateway,
          gatewayTransactionId: `craque-tx-${i + 1}-${today}`,
          status: 'PAID',
          processedAt: now,
        },
      })
    }

    // 3. Pagamentos adicionais para variedade
    const additionalPayments = [
      { gateway: 'stripe', amount: 5000 },
      { gateway: 'mercadopago', amount: 300 },
      { gateway: 'pix', amount: 200 },
      { gateway: 'paypal', amount: 300 },
      { gateway: 'pagseguro', amount: 200 },
    ]

    for (const payment of additionalPayments) {
      let sub = await prisma.subscription.findFirst({
        where: {
          gateway: payment.gateway as any,
          userId: user.id,
        },
      })

      if (!sub) {
        const expiresAt = new Date(now)
        expiresAt.setMonth(expiresAt.getMonth() + 1)

        sub = await prisma.subscription.create({
          data: {
            userId: user.id,
            planType: 'CRAQUE',
            gateway: payment.gateway as any,
            period: 'MONTHLY',
            amount: payment.amount,
            status: 'ACTIVE',
            startsAt: monthStart,
            expiresAt,
          },
        })
      }

      await prisma.payment.create({
        data: {
          userId: user.id,
          subscriptionId: sub.id,
          amount: payment.amount,
          gateway: payment.gateway as any,
          gatewayTransactionId: `extra-${payment.gateway}-${Date.now()}`,
          status: 'PAID',
          processedAt: now,
        },
      })
    }

    // Coleta estatísticas
    const subs = await prisma.subscription.count({
      where: { userId: user.id, status: 'ACTIVE' },
    })

    const payments = await prisma.payment.count({
      where: { userId: user.id, status: 'PAID' },
    })

    const mrrAgg = await prisma.subscription.aggregate({
      where: { userId: user.id, status: 'ACTIVE' },
      _sum: { amount: true },
    })

    const byGateway = await prisma.payment.groupBy({
      by: ['gateway'],
      where: {
        userId: user.id,
        status: 'PAID',
        createdAt: { gte: monthStart },
      },
      _sum: { amount: true },
    })

    return NextResponse.json({
      ok: true,
      message: 'Financial seed data created',
      data: {
        userId: user.id,
        userEmail: user.email,
        subscriptionsActive: subs,
        paymentsCreated: payments,
        mrrCents: mrrAgg._sum.amount ?? 0,
        mrrBRL: ((mrrAgg._sum.amount ?? 0) / 100).toFixed(2),
        revenueByGateway: byGateway.map((g) => ({
          gateway: g.gateway,
          amountCents: g._sum.amount ?? 0,
          amountBRL: ((g._sum.amount ?? 0) / 100).toFixed(2),
        })),
      },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      { status: 500 }
    )
  }
}
