/**
 * Teste de regressao — PlanService.applyPaymentConfirmedEffects (FIX-05)
 *
 * Atomicidade Payment.upsert + comissao de afiliado + sinal observavel.
 * Antes do fix, a comissao rodava DEPOIS do upsert e qualquer falha era engolida por um
 * `console.error`: o Payment ficava PAID mas a AffiliateTransaction PENDING (fila consumida pelo
 * cron affiliate-commission) nunca era criada — perda silenciosa de receita do afiliado.
 *
 * Aceite canonico:
 *  - Falha da comissao pos-upsert NAO gera perda silenciosa: a `$transaction` faz rollback
 *    (all-or-nothing) e a falha vira sinal OBSERVAVEL (Sentry.captureException) + re-lance para
 *    reprocessamento idempotente.
 *  - Sem regressao no caminho feliz: payment.upsert + createMany na mesma transacao; analytics
 *    disparado fora dela; replay (Payment ja PAID) nao recria comissao.
 */

const captureExceptionMock = jest.fn()
jest.mock('@/lib/monitoring/sentry', () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}))

jest.mock('@/lib/gateways/GatewayFactory', () => ({ getGateway: jest.fn() }))
jest.mock('@/lib/services/SubscriptionService', () => ({
  subscriptionService: { createSubscription: jest.fn() },
}))
jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({
  leagueAutoEnrollService: { enrollUserInPublicLeague: jest.fn() },
}))
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: jest.fn().mockResolvedValue({ notification: {}, deduped: false }) },
}))
jest.mock('@/lib/services/analytics/MixpanelServerService', () => ({
  mixpanelServer: {
    trackPaymentCompleted: jest.fn(),
    trackAffiliateConversion: jest.fn(),
  },
}))
jest.mock('@/lib/services/leagues/LeagueEventRecorder', () => ({
  leagueEventRecorder: { recordForAllActiveLeagues: jest.fn().mockResolvedValue(undefined) },
}))

// Cliente transacional reutilizado em cada chamada de $transaction. As assercoes de upsert/
// createMany observam ESTE objeto (a transacao roda contra ele, nao contra o prisma raiz).
const trxClient = {
  payment: { upsert: jest.fn() },
  user: { findUnique: jest.fn() },
  affiliateCode: { findFirst: jest.fn() },
  affiliateTransaction: { createMany: jest.fn() },
}

jest.mock('@/lib/prisma', () => ({
  prisma: {
    payment: { findUnique: jest.fn(), count: jest.fn() },
    // Executa o callback com o trxClient; rejeita se o callback lancar (rollback simulado).
    $transaction: jest.fn((cb: (trx: typeof trxClient) => Promise<unknown>) => cb(trxClient)),
  },
}))

import { PlanService } from '@/lib/services/PlanService'
import { prisma } from '@/lib/prisma'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'

const paymentFindUniqueMock = prisma.payment.findUnique as jest.Mock
const paymentCountMock = prisma.payment.count as jest.Mock
const trackAffiliateConversionMock = mixpanelServer.trackAffiliateConversion as jest.Mock
const trackPaymentCompletedMock = mixpanelServer.trackPaymentCompleted as jest.Mock

const planService = new PlanService()

const BASE_PARAMS = {
  userId: 'referred-user',
  subscriptionId: 'sub-1',
  amountCents: 3990,
  gateway: 'MERCADO_PAGO' as const,
  gatewayTransactionId: 'tx-1',
  planType: 'CRAQUE' as const,
}

function mockReferredAffiliate(): void {
  trxClient.user.findUnique.mockResolvedValue({ referredByCode: 'PARCEIRO10' })
  trxClient.affiliateCode.findFirst.mockResolvedValue({
    id: 'aff-1',
    userId: 'affiliate-owner',
    commissionPercentage: 0.1,
    affiliateType: 'TIME_PARCEIRO',
    code: 'PARCEIRO10',
  })
}

describe('PlanService.applyPaymentConfirmedEffects — atomicidade + sinal observavel (FIX-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    paymentFindUniqueMock.mockResolvedValue(null) // primeira consolidacao
    paymentCountMock.mockResolvedValue(1)
    trxClient.payment.upsert.mockResolvedValue(undefined)
    trxClient.affiliateTransaction.createMany.mockResolvedValue({ count: 1 })
  })

  it('caminho feliz: upsert + comissao na MESMA transacao; analytics disparado fora dela', async () => {
    mockReferredAffiliate()

    await expect(planService.applyPaymentConfirmedEffects(BASE_PARAMS)).resolves.toBeUndefined()

    // upsert e createMany rodaram contra o client transacional (atomicidade real).
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(trxClient.payment.upsert).toHaveBeenCalledTimes(1)
    expect(trxClient.affiliateTransaction.createMany).toHaveBeenCalledTimes(1)
    // FIX-03 preservado: R$39,90 (3990c) @ 10% -> 3,99 FS$.
    expect(trxClient.affiliateTransaction.createMany.mock.calls[0][0].data[0].amount).toBe(3.99)
    // Analytics e sinal observavel: sem erro no caminho feliz.
    expect(trackPaymentCompletedMock).toHaveBeenCalledTimes(1)
    expect(trackAffiliateConversionMock).toHaveBeenCalledWith('affiliate-owner', expect.objectContaining({ commissionAmount: '3.99' }))
    expect(captureExceptionMock).not.toHaveBeenCalled()
  })

  it('falha da comissao pos-upsert: rollback (re-lance) + sinal observavel, ZERO perda silenciosa', async () => {
    mockReferredAffiliate()
    const boom = new Error('createMany falhou (constraint/timeout)')
    trxClient.affiliateTransaction.createMany.mockRejectedValue(boom)

    // A transacao inteira rejeita (all-or-nothing) — o caller (webhook/cron) reprocessa.
    await expect(planService.applyPaymentConfirmedEffects(BASE_PARAMS)).rejects.toThrow(boom)

    // Sinal OBSERVAVEL emitido (nao mais um console.error engolido).
    expect(captureExceptionMock).toHaveBeenCalledTimes(1)
    expect(captureExceptionMock).toHaveBeenCalledWith(
      boom,
      expect.objectContaining({ tags: expect.objectContaining({ area: 'affiliate_commission' }) })
    )
    // Nenhum efeito best-effort pos-transacao disparou (a falha abortou o fluxo).
    expect(trackPaymentCompletedMock).not.toHaveBeenCalled()
    expect(trackAffiliateConversionMock).not.toHaveBeenCalled()
  })

  it('replay (Payment ja PAID): upsert idempotente sem recriar comissao nem analytics', async () => {
    paymentFindUniqueMock.mockResolvedValue({ status: 'PAID' })
    mockReferredAffiliate()

    await expect(planService.applyPaymentConfirmedEffects(BASE_PARAMS)).resolves.toBeUndefined()

    expect(trxClient.payment.upsert).toHaveBeenCalledTimes(1) // upsert sempre roda (idempotente)
    expect(trxClient.affiliateTransaction.createMany).not.toHaveBeenCalled() // comissao NAO duplica
    expect(trackPaymentCompletedMock).not.toHaveBeenCalled()
    expect(trackAffiliateConversionMock).not.toHaveBeenCalled()
    expect(captureExceptionMock).not.toHaveBeenCalled()
  })
})
