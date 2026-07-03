/**
 * Testes unitários — M066: guard anti-ciclagem "1 mudança de plano por ciclo".
 * Sem o guard, ciclagem up/down repetida farmaria o crédito pró-rata multiplicado
 * (FS$ 1.2x/1.3x). Guard POR CICLO, nunca one-time-ever (lição da classe de lockouts):
 * após a RENOVAÇÃO (currentPeriodStart avança além do startsAt) a troca volta a valer.
 */

jest.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://example.test' } }))

jest.mock('@/lib/prisma', () => {
  const subscription = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  }
  const user = { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() }
  const notification = { create: jest.fn().mockResolvedValue({}) }
  const payment = { findFirst: jest.fn().mockResolvedValue(null) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = { subscription, user, notification, payment }
  prisma.$transaction = jest.fn(async (arg: unknown): Promise<unknown> => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(prisma)
    return Promise.all(arg as Promise<unknown>[])
  })
  return { prisma }
})

jest.mock('@/lib/gateways/GatewayFactory', () => ({ getGateway: jest.fn() }))
jest.mock('@/lib/gateways/recurring-flag', () => ({ isRecurringEnabled: jest.fn().mockResolvedValue(false) }))
jest.mock('@/lib/services/SubscriptionService', () => ({
  subscriptionService: { createSubscription: jest.fn() },
}))
jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({
  leagueAutoEnrollService: { enrollUserInPublicLeague: jest.fn().mockResolvedValue(undefined) },
}))
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: jest.fn().mockResolvedValue({ notification: {}, deduped: false }) },
}))
jest.mock('@/lib/services/upgrade-proration', () => ({
  ensureUpgradeProrationRefund: jest.fn().mockResolvedValue(undefined),
  isUpgradeProrationRefundEnabled: jest.fn(() => false),
  upgradeProrationRefundFloorCents: jest.fn(() => 200),
}))

import { PlanService } from '@/lib/services/PlanService'
import { prisma } from '@/lib/prisma'
import { subscriptionService } from '@/lib/services/SubscriptionService'

const planService = new PlanService()
const sub = prisma.subscription as unknown as Record<string, jest.Mock>
const usr = prisma.user as unknown as Record<string, jest.Mock>
const createSub = subscriptionService.createSubscription as unknown as jest.Mock

const DAY = 24 * 60 * 60 * 1000
const SENTINEL = Object.assign(new Error('parou-no-create'), { code: 'SENTINEL', statusCode: 599 })

const DTO = {
  planType: 'LENDA' as const,
  period: 'monthly' as const,
  gateway: 'MERCADO_PAGO',
  userEmail: 'x@y.z',
}

beforeEach(() => {
  jest.clearAllMocks()
  usr.findUnique.mockResolvedValue({ planType: 'CRAQUE', adminRole: null, email: 'x@y.z' })
  createSub.mockRejectedValue(SENTINEL)
})

describe('createCheckout — guard 1 mudança de plano por ciclo (M066)', () => {
  it('sad: sub ACTIVE nasceu de upgrade NO ciclo corrente => bloqueia com PAYMENT_PLAN_CHANGE_LIMIT', async () => {
    const now = Date.now()
    sub.findFirst
      .mockResolvedValueOnce(null) // existingActive (LENDA ACTIVE) — não tem
      .mockResolvedValueOnce({
        // guard: CRAQUE ACTIVE que nasceu de upgrade há 2 dias, ciclo até +28d
        previousPlanType: 'JOGADOR',
        startsAt: new Date(now - 2 * DAY),
        expiresAt: new Date(now + 28 * DAY),
        currentPeriodStart: null,
        currentPeriodEnd: null,
      })

    await expect(planService.createCheckout('u1', DTO)).rejects.toMatchObject({
      code: 'PAYMENT_PLAN_CHANGE_LIMIT',
      statusCode: 429,
    })
    expect(createSub).not.toHaveBeenCalled()
  })

  it('happy: sub ACTIVE comprada direto (previousPlanType null) => guard não dispara', async () => {
    sub.findFirst
      .mockResolvedValueOnce(null) // existingActive
      .mockResolvedValueOnce({
        previousPlanType: null,
        startsAt: new Date(Date.now() - 2 * DAY),
        expiresAt: new Date(Date.now() + 28 * DAY),
        currentPeriodStart: null,
        currentPeriodEnd: null,
      })
      .mockResolvedValue(null) // openPending e demais lookups

    // Segue até a criação da subscription (sentinela) — o guard NÃO bloqueou.
    await expect(planService.createCheckout('u1', DTO)).rejects.toMatchObject({ code: 'SENTINEL' })
  })

  it('happy: upgrade de ciclo ANTERIOR (renovação já avançou currentPeriodStart) => permitido', async () => {
    const now = Date.now()
    sub.findFirst
      .mockResolvedValueOnce(null) // existingActive
      .mockResolvedValueOnce({
        previousPlanType: 'JOGADOR',
        startsAt: new Date(now - 40 * DAY), // troca aconteceu há 40 dias
        expiresAt: new Date(now + 20 * DAY),
        currentPeriodStart: new Date(now - 10 * DAY), // renovação avançou o ciclo
        currentPeriodEnd: new Date(now + 20 * DAY),
      })
      .mockResolvedValue(null)

    await expect(planService.createCheckout('u1', DTO)).rejects.toMatchObject({ code: 'SENTINEL' })
  })

  it('happy: usuário JOGADOR (sem plano pago) nunca passa pelo guard', async () => {
    usr.findUnique.mockResolvedValue({ planType: 'JOGADOR', adminRole: null, email: 'x@y.z' })
    sub.findFirst.mockResolvedValue(null)

    await expect(planService.createCheckout('u1', DTO)).rejects.toMatchObject({ code: 'SENTINEL' })
    // findFirst do guard nem é chamado com filtro de plano CRAQUE
    const guardCalls = sub.findFirst.mock.calls.filter(
      (c) => c[0]?.where?.status === 'ACTIVE' && c[0]?.select?.previousPlanType
    )
    expect(guardCalls).toHaveLength(0)
  })
})
