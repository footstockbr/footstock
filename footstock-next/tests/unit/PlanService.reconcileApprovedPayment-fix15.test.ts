/**
 * Testes unitarios — FIX-15 (Task 19): matriz de status da reconciliacao server-side.
 *
 * `PlanService.reconcileApprovedPayment` e o motor por tras de replay (admin) e do cron
 * `reconcile-payments` (item 12). Diferente do webhook, ele BUSCA o pagamento no Mercado Pago
 * (`getPaymentDetails`, aqui mockado) e decide ativar/rejeitar. Esta suite cobre a matriz
 * completa de status de retorno e garante que so o caminho aprovado dispara os efeitos
 * pos-ativacao compartilhados (`applyPaymentConfirmedEffects`).
 *
 * Aceite coberto (FIX-15): suites cobrem efeitos pos-ativacao + reconcile; verdes.
 */

jest.mock('@/lib/monitoring/sentry', () => ({ captureException: jest.fn() }))

const getPaymentDetailsMock = jest.fn()
jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGateway: jest.fn(() => ({ getPaymentDetails: getPaymentDetailsMock })),
}))
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
  mixpanelServer: { trackPaymentCompleted: jest.fn(), trackAffiliateConversion: jest.fn() },
}))
jest.mock('@/lib/services/leagues/LeagueEventRecorder', () => ({
  leagueEventRecorder: { recordForAllActiveLeagues: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findUnique: jest.fn() },
  },
}))

import { PlanService } from '@/lib/services/PlanService'
import { prisma } from '@/lib/prisma'
import { GatewayType } from '@/lib/gateways/IGateway'

const subFindUniqueMock = prisma.subscription.findUnique as jest.Mock

const planService = new PlanService()

// Stubs dos metodos colaboradores: reconcileApprovedPayment delega a ativacao (upgradeUser) e os
// efeitos (applyPaymentConfirmedEffects) — testados em suites proprias. Aqui isolamos a MATRIZ.
const upgradeSpy = jest.spyOn(planService, 'upgradeUser')
const effectsSpy = jest.spyOn(planService, 'applyPaymentConfirmedEffects')

// Pagamento MP aprovado e valido por padrao; cada teste sobrescreve o que precisa quebrar.
const APPROVED = { status: 'approved', externalReference: 'sub-1', amount: 39.9, liveMode: true }
const SUBSCRIPTION = { userId: 'user-1', amount: 3990, gateway: 'MERCADO_PAGO', planType: 'CRAQUE' }

beforeEach(() => {
  jest.clearAllMocks()
  getPaymentDetailsMock.mockResolvedValue({ ...APPROVED })
  subFindUniqueMock.mockResolvedValue({ ...SUBSCRIPTION })
  upgradeSpy.mockResolvedValue('ACTIVATED' as never)
  effectsSpy.mockResolvedValue(undefined as never)
})

describe('FIX-15 — reconcileApprovedPayment: matriz de status (fetch MP mockado)', () => {
  it('gateway nao suportado -> GATEWAY_NOT_SUPPORTED (nunca toca o MP)', async () => {
    const res = await planService.reconcileApprovedPayment(GatewayType.PAYPAL, 'pay-1')
    expect(res).toEqual({ ok: false, reason: 'GATEWAY_NOT_SUPPORTED', detail: 'PAYPAL' })
    expect(getPaymentDetailsMock).not.toHaveBeenCalled()
  })

  it('pagamento inexistente no MP -> PAYMENT_STATUS_UNRESOLVED', async () => {
    getPaymentDetailsMock.mockResolvedValue(null)
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: false, reason: 'PAYMENT_STATUS_UNRESOLVED' })
  })

  it('pagamento de teste (live_mode=false) -> TEST_PAYMENT, nunca ativa', async () => {
    getPaymentDetailsMock.mockResolvedValue({ ...APPROVED, liveMode: false })
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: false, reason: 'TEST_PAYMENT', detail: 'live_mode=false' })
    expect(upgradeSpy).not.toHaveBeenCalled()
  })

  it('status != approved -> PAYMENT_NOT_APPROVED com o status real no detail', async () => {
    getPaymentDetailsMock.mockResolvedValue({ ...APPROVED, status: 'pending' })
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: false, reason: 'PAYMENT_NOT_APPROVED', detail: 'pending' })
  })

  it('sem external_reference -> NO_EXTERNAL_REFERENCE', async () => {
    getPaymentDetailsMock.mockResolvedValue({ ...APPROVED, externalReference: '' })
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: false, reason: 'NO_EXTERNAL_REFERENCE' })
  })

  it('subscription inexistente -> SUBSCRIPTION_NOT_FOUND', async () => {
    subFindUniqueMock.mockResolvedValue(null)
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: false, reason: 'SUBSCRIPTION_NOT_FOUND', detail: 'sub-1' })
  })

  it('gateway da subscription divergente -> GATEWAY_MISMATCH', async () => {
    subFindUniqueMock.mockResolvedValue({ ...SUBSCRIPTION, gateway: 'PAGSEGURO' })
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: false, reason: 'GATEWAY_MISMATCH', detail: 'PAGSEGURO' })
  })

  it('valor pago diverge do esperado (> 1 centavo) -> AMOUNT_MISMATCH', async () => {
    subFindUniqueMock.mockResolvedValue({ ...SUBSCRIPTION, amount: 9990 })
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res.ok).toBe(false)
    expect((res as { reason: string }).reason).toBe('AMOUNT_MISMATCH')
    expect(upgradeSpy).not.toHaveBeenCalled()
  })

  it('upgradeUser NOT_ACTIVATABLE -> NOT_ACTIVATABLE, sem efeitos pos-ativacao', async () => {
    upgradeSpy.mockResolvedValue('NOT_ACTIVATABLE' as never)
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: false, reason: 'NOT_ACTIVATABLE', detail: 'sub-1' })
    expect(effectsSpy).not.toHaveBeenCalled()
  })

  it('upgradeUser lanca erro com code -> propaga o code em reason', async () => {
    upgradeSpy.mockRejectedValue(Object.assign(new Error('boom'), { code: 'AUTH-009' }))
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: false, reason: 'AUTH-009', detail: 'boom' })
    expect(effectsSpy).not.toHaveBeenCalled()
  })

  it('caminho feliz -> ACTIVATED + dispara applyPaymentConfirmedEffects com os mesmos dados', async () => {
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: true, action: 'ACTIVATED', subscriptionId: 'sub-1', userId: 'user-1' })
    expect(effectsSpy).toHaveBeenCalledTimes(1)
    expect(effectsSpy).toHaveBeenCalledWith({
      userId: 'user-1',
      subscriptionId: 'sub-1',
      amountCents: 3990,
      gateway: 'MERCADO_PAGO',
      gatewayTransactionId: 'pay-1',
      planType: 'CRAQUE',
    })
  })

  it('replay de pagamento ja ativo -> ALREADY_ACTIVE (efeitos idempotentes ainda rodam)', async () => {
    upgradeSpy.mockResolvedValue('ALREADY_ACTIVE' as never)
    const res = await planService.reconcileApprovedPayment(GatewayType.MERCADO_PAGO, 'pay-1')
    expect(res).toEqual({ ok: true, action: 'ALREADY_ACTIVE', subscriptionId: 'sub-1', userId: 'user-1' })
    expect(effectsSpy).toHaveBeenCalledTimes(1)
  })
})
