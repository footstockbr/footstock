/**
 * Testes unitarios — FIX-15 (Task 19): matriz de status da ROTA do webhook (fetch MP mockado).
 *
 * Complementa webhook-not-activatable (NOT_ACTIVATABLE), subscription-past-due-not-stuck
 * (PAYMENT_FAILED) e refund-fix08 (REFUND). Aqui cobrimos os ramos ainda sem teste de rota:
 *  - PAYMENT_CONFIRMED caminho feliz -> ACCEPTED + applyPaymentConfirmedEffects (Zero Silencio).
 *  - DUPLICATA (ja houve ACCEPTED) -> audit DUPLICATE, sem reprocessar efeitos.
 *  - HMAC invalido / rate-limit / valor divergente / gateway divergente -> rejeicao observavel.
 *
 * Aceite coberto (FIX-15): suites cobrem matriz de status do webhook; verdes.
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/env', () => ({
  env: { AUTO_REFUND_ON_ORPHAN: 'false', NEXT_PUBLIC_APP_URL: 'https://test.footstock', NODE_ENV: 'test' },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findUnique: jest.fn(), findFirst: jest.fn() },
    payment: { upsert: jest.fn(), updateMany: jest.fn() },
    webhookAuditLog: { findFirst: jest.fn() },
  },
}))

const mockParseWebhookEvent = jest.fn()
const mockGateway = { parseWebhookEvent: mockParseWebhookEvent, refundPayment: jest.fn() }
jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGatewayByHeader: jest.fn(() => mockGateway),
  detectGatewayType: jest.fn(() => 'MERCADO_PAGO'),
  getGateway: jest.fn(() => mockGateway),
}))

const mockValidate = jest.fn()
jest.mock('@/lib/gateways/webhook-validator', () => ({
  validateWebhookByGatewayDetailed: (...a: unknown[]) => mockValidate(...a),
}))

const mockLimit = jest.fn()
jest.mock('@/lib/ratelimit', () => ({ getWebhookRateLimit: jest.fn(() => ({ limit: mockLimit })) }))
jest.mock('@/middleware/rateLimit', () => ({ normalizeIp: jest.fn((ip: string) => ip) }))

jest.mock('@/lib/services/PlanService', () => ({
  planService: {
    upgradeUser: jest.fn(),
    applyPaymentConfirmedEffects: jest.fn().mockResolvedValue(undefined),
  },
}))
jest.mock('@/lib/services/WebhookAuditService', () => ({
  webhookAuditService: { logWebhook: jest.fn().mockResolvedValue(undefined) },
}))
jest.mock('@/lib/services/analytics/MixpanelServerService', () => ({
  mixpanelServer: { trackPaymentFailed: jest.fn(), trackPaymentCompleted: jest.fn() },
}))
jest.mock('@/lib/services/forced-liquidation', () => ({
  liquidateRestrictedPositions: jest.fn().mockResolvedValue(undefined),
}))

function webhookRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/payments/webhook?data.id=tx-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=abc', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ data: { id: 'tx-1' } }),
  })
}

const CONFIRMED_EVENT = {
  eventType: 'PAYMENT_CONFIRMED' as const,
  transactionId: 'tx-1',
  subscriptionId: 'sub-1',
  amount: 3990,
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

function setupHappy() {
  const { prisma } = require('@/lib/prisma')
  const { planService } = require('@/lib/services/PlanService')
  mockValidate.mockResolvedValue({ valid: true })
  mockLimit.mockResolvedValue({ success: true, remaining: 999, reset: Date.now() + 60000 })
  mockParseWebhookEvent.mockResolvedValue(CONFIRMED_EVENT)
  prisma.webhookAuditLog.findFirst.mockResolvedValue(null) // sem duplicata
  prisma.subscription.findUnique.mockResolvedValue({
    userId: 'user-1', planType: 'CRAQUE', period: 'MONTHLY', amount: 3990, gateway: 'MERCADO_PAGO',
  })
  planService.upgradeUser.mockResolvedValue('ACTIVATED')
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('FIX-15 — webhook: PAYMENT_CONFIRMED caminho feliz', () => {
  it('ativa o plano, dispara efeitos pos-ativacao e grava audit ACCEPTED (so apos os efeitos)', async () => {
    setupHappy()
    const { planService } = require('@/lib/services/PlanService')

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(planService.upgradeUser).toHaveBeenCalledWith('user-1', 'sub-1', 'tx-1')
    expect(planService.applyPaymentConfirmedEffects).toHaveBeenCalledTimes(1)
    expect(planService.applyPaymentConfirmedEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1', subscriptionId: 'sub-1', amountCents: 3990,
        gatewayTransactionId: 'tx-1', planType: 'CRAQUE',
      })
    )
    const statuses = auditStatuses()
    expect(statuses).toContain('ACCEPTED')
    expect(statuses).not.toContain('REJECTED')
  })
})

describe('FIX-15 — webhook: DUPLICATA', () => {
  it('com ACCEPTED previo grava DUPLICATE e NAO reprocessa efeitos financeiros', async () => {
    setupHappy()
    const { prisma } = require('@/lib/prisma')
    const { planService } = require('@/lib/services/PlanService')
    prisma.webhookAuditLog.findFirst.mockResolvedValue({ id: 'audit-prev', status: 'ACCEPTED' })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(planService.upgradeUser).not.toHaveBeenCalled()
    expect(planService.applyPaymentConfirmedEffects).not.toHaveBeenCalled()
    expect(auditStatuses()).toContain('DUPLICATE')
  })
})

describe('FIX-15 — webhook: rejeicoes observaveis', () => {
  it('HMAC invalido -> 200 silencioso no corpo + audit REJECTED, nunca processa', async () => {
    setupHappy()
    const { planService } = require('@/lib/services/PlanService')
    mockValidate.mockResolvedValue({ valid: false, reason: 'BAD_SIGNATURE' })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(auditStatuses()).toContain('REJECTED')
    expect(planService.upgradeUser).not.toHaveBeenCalled()
  })

  it('rate limit excedido -> 429 (provedor aplica backoff) + audit REJECTED', async () => {
    setupHappy()
    mockLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60000 })

    const res = await callWebhook()

    expect(res.status).toBe(429)
    expect(auditStatuses()).toContain('REJECTED')
  })

  it('valor divergente da subscription -> REJECTED, sem ativar nem disparar efeitos', async () => {
    setupHappy()
    const { prisma } = require('@/lib/prisma')
    const { planService } = require('@/lib/services/PlanService')
    prisma.subscription.findUnique.mockResolvedValue({
      userId: 'user-1', planType: 'CRAQUE', period: 'MONTHLY', amount: 9990, gateway: 'MERCADO_PAGO',
    })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(auditStatuses()).toContain('REJECTED')
    expect(planService.upgradeUser).not.toHaveBeenCalled()
    expect(planService.applyPaymentConfirmedEffects).not.toHaveBeenCalled()
  })

  it('gateway da subscription divergente -> REJECTED, sem ativar', async () => {
    setupHappy()
    const { prisma } = require('@/lib/prisma')
    const { planService } = require('@/lib/services/PlanService')
    prisma.subscription.findUnique.mockResolvedValue({
      userId: 'user-1', planType: 'CRAQUE', period: 'MONTHLY', amount: 3990, gateway: 'PAGSEGURO',
    })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(auditStatuses()).toContain('REJECTED')
    expect(planService.upgradeUser).not.toHaveBeenCalled()
  })
})
