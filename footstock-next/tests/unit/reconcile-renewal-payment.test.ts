/**
 * Testes — reconcileRenewalPayment (item 4b): recupera uma RENOVAÇÃO cujo webhook se perdeu.
 * MONEY-SAFE: só estende com pagamento APROVADO real (searchApprovedPayment + getPaymentDetails
 * approved+live+valor-bate), nunca pelo status do preapproval. IDEMPOTENTE: Payment.create (unique)
 * reivindica; P2002 -> ALREADY_RECONCILED (sem dupla extensão). Não ressuscita cancelamento.
 */

jest.mock('@/lib/env', () => ({
  env: { NEXT_PUBLIC_APP_URL: 'https://app.test', MERCADO_PAGO_ACCESS_TOKEN: 'tok' },
}))
jest.mock('@/lib/prisma', () => {
  const subscription = { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
  const payment = { create: jest.fn().mockResolvedValue({}) }
  const user = { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prisma: any = { subscription, payment, user }
  prisma.$transaction = jest.fn(async (arg: unknown): Promise<unknown> =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
  )
  return { prisma }
})
const mockGateway = {
  searchApprovedPaymentByExternalReference: jest.fn(),
  getPaymentDetails: jest.fn(),
}
jest.mock('@/lib/gateways/GatewayFactory', () => ({ getGateway: jest.fn(() => mockGateway) }))
jest.mock('@/lib/services/SubscriptionService', () => ({ subscriptionService: { createSubscription: jest.fn() } }))
jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({ leagueAutoEnrollService: { enrollUserInPublicLeague: jest.fn() } }))
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: jest.fn().mockResolvedValue({ notification: {}, deduped: false }) },
}))
jest.mock('@/lib/gateways/recurring-flag', () => ({ isRecurringEnabled: jest.fn().mockResolvedValue(false) }))

import { PlanService } from '@/lib/services/PlanService'
import { GatewayType } from '@/lib/gateways/IGateway'
const planService = new PlanService()

const recurringSub = (o: Record<string, unknown> = {}) => ({
  userId: 'u1', amount: 100, gateway: 'MERCADO_PAGO', period: 'MONTHLY',
  status: 'EXPIRED', expiresAt: new Date(Date.now() - 5 * 86_400_000),
  billingMode: 'recurring', gatewaySubscriptionId: 'preapp-1', ...o,
})
const approvedPayment = (o: Record<string, unknown> = {}) => ({
  status: 'approved', externalReference: 'sub-1', amount: 1.0, liveMode: true, ...o,
})

beforeEach(() => jest.clearAllMocks())

describe('reconcileRenewalPayment (item 4b — recuperação de ciclo pago)', () => {
  it('RENEWED: pagamento aprovado não registrado → Payment PAID + estende expiresAt + religa user', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.subscription.findUnique.mockResolvedValue(recurringSub())
    mockGateway.searchApprovedPaymentByExternalReference.mockResolvedValue('pay-99')
    mockGateway.getPaymentDetails.mockResolvedValue(approvedPayment())

    const res = await planService.reconcileRenewalPayment(GatewayType.MERCADO_PAGO, 'sub-1')

    expect(res).toMatchObject({ ok: true, action: 'RENEWED' })
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gatewayTransactionId: 'pay-99', status: 'PAID', amount: 100 }) }),
    )
    const upd = prisma.subscription.updateMany.mock.calls[0][0]
    expect(upd.data.status).toBe('ACTIVE')
    expect(upd.data.expiresAt).toBeInstanceOf(Date)
    expect(upd.where.status).toEqual({ notIn: ['CANCELLED', 'CANCELLATION_LOCK'] }) // anti-ressurreição
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1', status: 'SUSPENDED' }, data: { status: 'ACTIVE' } }),
    )
  })

  it('ALREADY_RECONCILED: Payment.create colide (P2002) → NÃO estende duas vezes (idempotente)', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.subscription.findUnique.mockResolvedValue(recurringSub())
    mockGateway.searchApprovedPaymentByExternalReference.mockResolvedValue('pay-99')
    mockGateway.getPaymentDetails.mockResolvedValue(approvedPayment())
    prisma.payment.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))

    const res = await planService.reconcileRenewalPayment(GatewayType.MERCADO_PAGO, 'sub-1')

    expect(res).toMatchObject({ ok: true, action: 'ALREADY_RECONCILED' })
  })

  it('NO_APPROVED_PAYMENT: sem pagamento aprovado no gateway → não toca nada', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.subscription.findUnique.mockResolvedValue(recurringSub())
    mockGateway.searchApprovedPaymentByExternalReference.mockResolvedValue(null)

    const res = await planService.reconcileRenewalPayment(GatewayType.MERCADO_PAGO, 'sub-1')

    expect(res).toMatchObject({ ok: true, action: 'NO_APPROVED_PAYMENT' })
    expect(prisma.payment.create).not.toHaveBeenCalled()
  })

  it('AMOUNT_MISMATCH: valor pago diverge da sub → NÃO estende (não credita valor errado)', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.subscription.findUnique.mockResolvedValue(recurringSub({ amount: 100 }))
    mockGateway.searchApprovedPaymentByExternalReference.mockResolvedValue('pay-99')
    mockGateway.getPaymentDetails.mockResolvedValue(approvedPayment({ amount: 5.0 })) // 500c != 100c

    const res = await planService.reconcileRenewalPayment(GatewayType.MERCADO_PAGO, 'sub-1')

    expect(res).toMatchObject({ ok: false, reason: 'AMOUNT_MISMATCH' })
    expect(prisma.payment.create).not.toHaveBeenCalled()
  })

  it('TEST_PAYMENT: live_mode=false → NÃO estende (nunca ativa de pagamento de teste)', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.subscription.findUnique.mockResolvedValue(recurringSub())
    mockGateway.searchApprovedPaymentByExternalReference.mockResolvedValue('pay-99')
    mockGateway.getPaymentDetails.mockResolvedValue(approvedPayment({ liveMode: false }))

    const res = await planService.reconcileRenewalPayment(GatewayType.MERCADO_PAGO, 'sub-1')

    expect(res).toMatchObject({ ok: false, reason: 'TEST_PAYMENT' })
    expect(prisma.payment.create).not.toHaveBeenCalled()
  })

  it('NOT_RECOVERABLE: sub CANCELADA pelo usuário → NÃO ressuscita nem consulta gateway', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.subscription.findUnique.mockResolvedValue(recurringSub({ status: 'CANCELLED' }))

    const res = await planService.reconcileRenewalPayment(GatewayType.MERCADO_PAGO, 'sub-1')

    expect(res).toMatchObject({ ok: false, reason: 'NOT_RECOVERABLE' })
    expect(mockGateway.searchApprovedPaymentByExternalReference).not.toHaveBeenCalled()
  })

  it('RACE_CANCELLED: sub cancelada ENTRE a leitura e a transação → rollback (sem Payment nem extensão)', async () => {
    const { prisma } = require('@/lib/prisma')
    // outer read: recuperável (EXPIRED); fresh read DENTRO da tx: já CANCELLED (corrida) → RenewalRaceError.
    prisma.subscription.findUnique
      .mockResolvedValueOnce(recurringSub({ status: 'EXPIRED' }))
      .mockResolvedValueOnce({ status: 'CANCELLED', expiresAt: new Date() })
    mockGateway.searchApprovedPaymentByExternalReference.mockResolvedValue('pay-99')
    mockGateway.getPaymentDetails.mockResolvedValue(approvedPayment())

    const res = await planService.reconcileRenewalPayment(GatewayType.MERCADO_PAGO, 'sub-1')

    expect(res).toMatchObject({ ok: false, reason: 'RACE_CANCELLED' })
    // updateMany de extensão NÃO roda (o rollback é disparado pelo fresh read cancelado antes dela).
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled()
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('EXTERNAL_REFERENCE_MISMATCH: pagamento de OUTRA assinatura → NÃO estende', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.subscription.findUnique.mockResolvedValue(recurringSub())
    mockGateway.searchApprovedPaymentByExternalReference.mockResolvedValue('pay-99')
    mockGateway.getPaymentDetails.mockResolvedValue(approvedPayment({ externalReference: 'sub-OUTRA' }))

    const res = await planService.reconcileRenewalPayment(GatewayType.MERCADO_PAGO, 'sub-1')

    expect(res).toMatchObject({ ok: false, reason: 'EXTERNAL_REFERENCE_MISMATCH' })
    expect(prisma.payment.create).not.toHaveBeenCalled()
  })
})
