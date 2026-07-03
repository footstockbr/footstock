/**
 * Testes unitários — ativação vs renovação no ciclo recorrente (SUBSCRIPTION_RENEWED).
 *
 * Bug corrigido: a 1ª cobrança recorrente (assinatura PENDING) caía em SUBSCRIPTION_RENEWED,
 * que só setava Subscription.ACTIVE + Payment PAID, MAS nunca User.planType (a fonte de acesso).
 * Resultado: usuário pagava e ficava sem acesso. Além disso, estender a vigência pré-alocada
 * (now+período) dobrava o acesso. Fix: PENDING => ativação (upgradeUser + efeitos + 1º período
 * a partir de agora); ACTIVE => renovação (estende).
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/env', () => ({
  env: { AUTO_REFUND_ON_ORPHAN: 'false', NEXT_PUBLIC_APP_URL: 'https://test.footstock', NODE_ENV: 'test' },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    payment: { upsert: jest.fn() },
    webhookAuditLog: { findFirst: jest.fn() },
  },
}))

const mockParseWebhookEvent = jest.fn()
const mockGateway = { parseWebhookEvent: mockParseWebhookEvent }
jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGatewayByHeader: jest.fn(() => mockGateway),
  detectGatewayType: jest.fn(() => 'MERCADO_PAGO'),
  getGateway: jest.fn(() => mockGateway),
}))
jest.mock('@/lib/gateways/webhook-validator', () => ({
  validateWebhookByGatewayDetailed: jest.fn().mockResolvedValue({ valid: true }),
}))
jest.mock('@/lib/ratelimit', () => ({
  getWebhookRateLimit: jest.fn(() => ({
    limit: jest.fn().mockResolvedValue({ success: true, remaining: 999, reset: Date.now() + 60000 }),
  })),
}))
jest.mock('@/middleware/rateLimit', () => ({ normalizeIp: jest.fn((ip: string) => ip) }))
jest.mock('@/lib/services/PlanService', () => ({
  planService: {
    upgradeUser: jest.fn(),
    applyPaymentConfirmedEffects: jest.fn().mockResolvedValue(undefined),
    applyRenewalCycle: jest.fn().mockResolvedValue('RENEWED'),
  },
}))
jest.mock('@/lib/services/WebhookAuditService', () => ({
  webhookAuditService: { logWebhook: jest.fn().mockResolvedValue(undefined) },
}))
jest.mock('@/lib/services/analytics/MixpanelServerService', () => ({
  mixpanelServer: { trackPaymentCompleted: jest.fn(), trackPaymentFailed: jest.fn() },
}))

function webhookRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/payments/webhook?data.id=tx-cycle', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=abc', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ data: { id: 'tx-cycle' } }),
  })
}

const RENEW_EVENT = {
  eventType: 'SUBSCRIPTION_RENEWED' as const,
  transactionId: 'pay-cycle-1',
  subscriptionId: 'sub-1',
  amount: 100,
  gateway: 'MERCADO_PAGO',
  rawPayload: '{}',
}

async function callWebhook() {
  const { POST } = await import('@/app/api/v1/payments/webhook/route')
  return POST(webhookRequest())
}
function auditStatuses() {
  const { webhookAuditService } = require('@/lib/services/WebhookAuditService')
  return (webhookAuditService.logWebhook as jest.Mock).mock.calls.map((c) => c[0].status)
}

beforeEach(() => {
  jest.clearAllMocks()
  // clearAllMocks limpa chamadas mas NÃO a implementação — reafirma os defaults por teste.
  const { planService } = require('@/lib/services/PlanService')
  planService.applyRenewalCycle.mockResolvedValue('RENEWED')
  planService.applyPaymentConfirmedEffects.mockResolvedValue(undefined)
})

describe('SUBSCRIPTION_RENEWED — ativação (PENDING) vs renovação (ACTIVE)', () => {
  it('1ª cobrança (PENDING) ATIVA: upgradeUser + applyPaymentConfirmedEffects + 1º período de agora', async () => {
    const { prisma } = require('@/lib/prisma')
    const { planService } = require('@/lib/services/PlanService')
    mockParseWebhookEvent.mockResolvedValue(RENEW_EVENT)
    prisma.webhookAuditLog.findFirst.mockResolvedValue(null)
    prisma.subscription.findUnique.mockResolvedValue({
      userId: 'user-1', planType: 'CRAQUE', period: 'MONTHLY', gateway: 'MERCADO_PAGO',
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // pré-alocada (não deve ser estendida)
      status: 'PENDING', amount: 100,
    })
    planService.upgradeUser.mockResolvedValue('ACTIVATED')

    const res = await callWebhook()

    expect(res.status).toBe(200)
    // Ativação: seta o entitlement (User.planType) via upgradeUser.
    expect(planService.upgradeUser).toHaveBeenCalledWith('user-1', 'sub-1', 'pay-cycle-1')
    // Efeitos de 1ª compra (Payment PAID + comissão/analytics) — não o payment.upsert do ramo renovação.
    expect(planService.applyPaymentConfirmedEffects).toHaveBeenCalledTimes(1)
    expect(prisma.payment.upsert).not.toHaveBeenCalled()
    // Vigência do 1º período a partir de agora (update SEM status:'ACTIVE' — quem ativa é upgradeUser).
    const upd = prisma.subscription.update.mock.calls[0][0]
    expect(upd.data.status).toBeUndefined()
    expect(upd.data.gatewayStatus).toBe('authorized')
    expect(upd.data.expiresAt.getTime()).toBeLessThan(Date.now() + 32 * 24 * 3600 * 1000) // ~1 mês, não ~2
    expect(auditStatuses()).toContain('ACCEPTED')
  })

  it('cobrança de renovação (ACTIVE) NÃO chama upgradeUser: delega a applyRenewalCycle + analytics', async () => {
    const { prisma } = require('@/lib/prisma')
    const { planService } = require('@/lib/services/PlanService')
    const { mixpanelServer } = require('@/lib/services/analytics/MixpanelServerService')
    mockParseWebhookEvent.mockResolvedValue(RENEW_EVENT)
    prisma.webhookAuditLog.findFirst.mockResolvedValue(null)
    prisma.subscription.findUnique.mockResolvedValue({
      userId: 'user-1', planType: 'CRAQUE', period: 'MONTHLY', gateway: 'MERCADO_PAGO',
      expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000), status: 'ACTIVE', amount: 100,
    })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(planService.upgradeUser).not.toHaveBeenCalled()
    expect(planService.applyPaymentConfirmedEffects).not.toHaveBeenCalled()
    // Renovação via ponto único applyRenewalCycle (claim atômico serializa webhook x cron, extende + religa).
    expect(planService.applyRenewalCycle).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'sub-1', userId: 'user-1', paymentId: 'pay-cycle-1', amountCents: 100, period: 'MONTHLY' }),
    )
    expect(mixpanelServer.trackPaymentCompleted).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ is_first_payment: false }),
    )
    expect(auditStatuses()).toContain('ACCEPTED')
  })

  it('#5 CRÍTICO: renovação delega a applyRenewalCycle (que religa SUSPENDED e estende) com params corretos', async () => {
    const { prisma } = require('@/lib/prisma')
    const { planService } = require('@/lib/services/PlanService')
    mockParseWebhookEvent.mockResolvedValue(RENEW_EVENT)
    prisma.webhookAuditLog.findFirst.mockResolvedValue(null)
    prisma.subscription.findUnique.mockResolvedValue({
      userId: 'user-1', planType: 'CRAQUE', period: 'MONTHLY', gateway: 'MERCADO_PAGO',
      expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000), status: 'ACTIVE', amount: 100,
    })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    // O religar SUSPENDED→ACTIVE mora dentro de applyRenewalCycle (coberto em reconcile-renewal-payment.test).
    // Aqui garantimos que a renovação de ciclo REALMENTE roteia pelo ponto único (senão o suspenso ficava preso).
    expect(planService.applyRenewalCycle).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'sub-1', userId: 'user-1', period: 'MONTHLY' }),
    )
  })

  it('#8: renovação ATRASADA para assinatura CANCELADA NÃO ressuscita (RACE_CANCELLED → REJECTED, sem analytics)', async () => {
    const { prisma } = require('@/lib/prisma')
    const { planService } = require('@/lib/services/PlanService')
    const { mixpanelServer } = require('@/lib/services/analytics/MixpanelServerService')
    mockParseWebhookEvent.mockResolvedValue(RENEW_EVENT)
    prisma.webhookAuditLog.findFirst.mockResolvedValue(null)
    prisma.subscription.findUnique.mockResolvedValue({
      userId: 'user-1', planType: 'CRAQUE', period: 'MONTHLY', gateway: 'MERCADO_PAGO',
      expiresAt: new Date(Date.now() - 5 * 24 * 3600 * 1000), status: 'CANCELLED', amount: 100,
    })
    planService.applyRenewalCycle.mockResolvedValue('RACE_CANCELLED') // sub cancelada → rollback, não ressuscita

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(mixpanelServer.trackPaymentCompleted).not.toHaveBeenCalled() // não conta renovação de cancelada
    expect(auditStatuses()).toContain('REJECTED')
  })

  it('renovação (ACTIVE) com VALOR DIVERGENTE é REJEITADA sem estender (não credita valor errado)', async () => {
    const { prisma } = require('@/lib/prisma')
    const { planService } = require('@/lib/services/PlanService')
    mockParseWebhookEvent.mockResolvedValue({ ...RENEW_EVENT, amount: 999 }) // != subscription.amount 100
    prisma.webhookAuditLog.findFirst.mockResolvedValue(null)
    prisma.subscription.findUnique.mockResolvedValue({
      userId: 'user-1', planType: 'CRAQUE', period: 'MONTHLY', gateway: 'MERCADO_PAGO',
      expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000), status: 'ACTIVE', amount: 100,
    })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(planService.applyRenewalCycle).not.toHaveBeenCalled() // nem chega a renovar
    expect(auditStatuses()).toContain('REJECTED')
  })

  it('ativação (PENDING) com valor divergente é REJEITADA sem ativar (não paga sem conferir valor)', async () => {
    const { prisma } = require('@/lib/prisma')
    const { planService } = require('@/lib/services/PlanService')
    mockParseWebhookEvent.mockResolvedValue({ ...RENEW_EVENT, amount: 999 }) // != subscription.amount 100
    prisma.webhookAuditLog.findFirst.mockResolvedValue(null)
    prisma.subscription.findUnique.mockResolvedValue({
      userId: 'user-1', planType: 'CRAQUE', period: 'MONTHLY', gateway: 'MERCADO_PAGO',
      expiresAt: new Date(), status: 'PENDING', amount: 100,
    })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(planService.upgradeUser).not.toHaveBeenCalled()
    expect(auditStatuses()).toContain('REJECTED')
  })
})
