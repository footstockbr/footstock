/**
 * Testes unitários — FIX-01: ramo NOT_ACTIVATABLE do webhook de pagamento.
 * Loop 06-22-footstock-financeiro-planos (Task 03).
 *
 * Cobre o Aceite:
 *  - PAYMENT_CONFIRMED para sub em estado terminal gera Payment CAPTURED_NOT_ACTIVATED +
 *    audit REJECTED, NUNCA ACCEPTED-sem-Payment.
 *  - Com AUTO_REFUND_ON_ORPHAN=false (default), nenhum estorno automático.
 *  - Com a flag on e órfão comprovado (sem sub ACTIVE cobrindo), estorno idempotente.
 *  - PROIBIDO estornar pagamento com plano ATIVO correspondente.
 */

import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/env', () => ({
  env: {
    AUTO_REFUND_ON_ORPHAN: 'false',
    NEXT_PUBLIC_APP_URL: 'https://test.footstock',
    NODE_ENV: 'test',
  },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findUnique: jest.fn(), findFirst: jest.fn() },
    payment: { upsert: jest.fn(), updateMany: jest.fn() },
    webhookAuditLog: { findFirst: jest.fn() },
  },
}))

const mockParseWebhookEvent = jest.fn()
const mockRefundPayment = jest.fn()
const mockGateway = { parseWebhookEvent: mockParseWebhookEvent, refundPayment: mockRefundPayment }

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
  },
}))

jest.mock('@/lib/services/WebhookAuditService', () => ({
  webhookAuditService: { logWebhook: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock('@/lib/services/analytics/MixpanelServerService', () => ({
  mixpanelServer: { trackPaymentFailed: jest.fn() },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function webhookRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/payments/webhook?data.id=tx-orphan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=abc', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ data: { id: 'tx-orphan' } }),
  })
}

const TERMINAL_EVENT = {
  eventType: 'PAYMENT_CONFIRMED' as const,
  transactionId: 'tx-orphan',
  subscriptionId: 'sub-expired',
  amount: 3990,
  gateway: 'MERCADO_PAGO',
  rawPayload: '{}',
}

function setupTerminalCapture() {
  const { prisma } = require('@/lib/prisma')
  const { planService } = require('@/lib/services/PlanService')
  mockParseWebhookEvent.mockResolvedValue(TERMINAL_EVENT)
  prisma.webhookAuditLog.findFirst.mockResolvedValue(null) // sem duplicata ACCEPTED
  prisma.subscription.findUnique.mockResolvedValue({
    userId: 'user-1',
    planType: 'CRAQUE',
    period: 'MONTHLY',
    amount: 3990,
    gateway: 'MERCADO_PAGO',
  })
  planService.upgradeUser.mockResolvedValue('NOT_ACTIVATABLE')
}

async function callWebhook() {
  const { POST } = await import('@/app/api/v1/payments/webhook/route')
  return POST(webhookRequest())
}

function auditCalls() {
  const { webhookAuditService } = require('@/lib/services/WebhookAuditService')
  return (webhookAuditService.logWebhook as jest.Mock).mock.calls.map((c) => c[0])
}

beforeEach(() => {
  jest.clearAllMocks()
  const { env } = require('@/lib/env')
  env.AUTO_REFUND_ON_ORPHAN = 'false'
})

describe('FIX-01 — webhook NOT_ACTIVATABLE', () => {
  it('registra Payment CAPTURED_NOT_ACTIVATED + audit REJECTED, nunca ACCEPTED-sem-Payment', async () => {
    setupTerminalCapture()
    const { prisma } = require('@/lib/prisma')
    prisma.payment.upsert.mockResolvedValue({ id: 'pay-1', status: 'CAPTURED_NOT_ACTIVATED' })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    // Payment criado com o status correto, idempotente por gatewayTransactionId.
    expect(prisma.payment.upsert).toHaveBeenCalledTimes(1)
    const upsertArg = prisma.payment.upsert.mock.calls[0][0]
    expect(upsertArg.where).toEqual({ gatewayTransactionId: 'tx-orphan' })
    expect(upsertArg.create.status).toBe('CAPTURED_NOT_ACTIVATED')
    expect(upsertArg.create.userId).toBe('user-1')
    expect(upsertArg.create.subscriptionId).toBe('sub-expired')
    expect(upsertArg.create.amount).toBe(3990)
    // Audit REJECTED — e NUNCA ACCEPTED neste ramo.
    const statuses = auditCalls().map((a) => a.status)
    expect(statuses).toContain('REJECTED')
    expect(statuses).not.toContain('ACCEPTED')
  })

  it('com AUTO_REFUND_ON_ORPHAN=false (default) não chama estorno no gateway', async () => {
    setupTerminalCapture()
    const { prisma } = require('@/lib/prisma')
    prisma.payment.upsert.mockResolvedValue({ id: 'pay-1', status: 'CAPTURED_NOT_ACTIVATED' })

    await callWebhook()

    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  it('com flag on e órfão comprovado (sem sub ACTIVE cobrindo) estorna idempotente', async () => {
    setupTerminalCapture()
    const { prisma } = require('@/lib/prisma')
    const { env } = require('@/lib/env')
    env.AUTO_REFUND_ON_ORPHAN = 'true'
    prisma.payment.upsert.mockResolvedValue({ id: 'pay-1', status: 'CAPTURED_NOT_ACTIVATED' })
    prisma.subscription.findFirst.mockResolvedValue(null) // nenhuma sub ACTIVE cobrindo
    mockRefundPayment.mockResolvedValue({ refundId: 'r-1', status: 'approved', alreadyRefunded: false })
    prisma.payment.updateMany.mockResolvedValue({ count: 1 })

    await callWebhook()

    expect(mockRefundPayment).toHaveBeenCalledWith('tx-orphan')
    // Promoção para REFUNDED via CAS (where status CAPTURED_NOT_ACTIVATED).
    const updArg = prisma.payment.updateMany.mock.calls[0][0]
    expect(updArg.where).toEqual({ id: 'pay-1', status: 'CAPTURED_NOT_ACTIVATED' })
    expect(updArg.data).toEqual({ status: 'REFUNDED' })
  })

  it('PROIBIDO estornar: sub ACTIVE cobrindo o tier retém o estorno mesmo com flag on', async () => {
    setupTerminalCapture()
    const { prisma } = require('@/lib/prisma')
    const { env } = require('@/lib/env')
    env.AUTO_REFUND_ON_ORPHAN = 'true'
    prisma.payment.upsert.mockResolvedValue({ id: 'pay-1', status: 'CAPTURED_NOT_ACTIVATED' })
    prisma.subscription.findFirst.mockResolvedValue({ id: 'sub-active', planType: 'LENDA' })

    await callWebhook()

    expect(mockRefundPayment).not.toHaveBeenCalled()
    // Plano cobrindo deve ser buscado por tier >= capturado (CRAQUE → CRAQUE/LENDA).
    const findArg = prisma.subscription.findFirst.mock.calls[0][0]
    expect(findArg.where.status).toBe('ACTIVE')
    expect(findArg.where.planType.in).toEqual(['CRAQUE', 'LENDA'])
  })

  it('replay idempotente: Payment já REFUNDED não estorna de novo', async () => {
    setupTerminalCapture()
    const { prisma } = require('@/lib/prisma')
    const { env } = require('@/lib/env')
    env.AUTO_REFUND_ON_ORPHAN = 'true'
    prisma.payment.upsert.mockResolvedValue({ id: 'pay-1', status: 'REFUNDED' })

    await callWebhook()

    expect(mockRefundPayment).not.toHaveBeenCalled()
    expect(prisma.subscription.findFirst).not.toHaveBeenCalled()
  })
})
