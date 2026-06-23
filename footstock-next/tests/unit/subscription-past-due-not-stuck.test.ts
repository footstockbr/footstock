/**
 * Testes unitários — FIX-04: resolver o estado-sink PAST_DUE.
 * Loop 06-22-footstock-financeiro-planos (Task 12).
 *
 * Decisão DEFAULT (alinhada ao source.md): o handler de PAYMENT_FAILED no webhook
 * transiciona a assinatura DIRETO para EXPIRED em vez de PAST_DUE. Assim a entrada no
 * estado-sink PAST_DUE deixa de ocorrer na origem — nenhuma assinatura fica presa em
 * PAST_DUE sem uma transição de saída.
 *
 * Invariante validado (refletido no nome do arquivo): nenhuma subscription presa em
 * PAST_DUE. O nome NÃO implica que o DunningService consome PAST_DUE no DEFAULT — no
 * DEFAULT o estado é eliminado na origem (webhook -> EXPIRED), e EXPIRED é consumido tanto
 * pelo DunningService (retentativas D+1/D+3/D+7) quanto pelo subscription-expiry
 * (suspensão/downgrade). O teste parte do cenário em que o código antigo gravaria PAST_DUE
 * e prova que agora o destino é EXPIRED, com expiresAt garantido não-nulo.
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
    subscription: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
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
  return new NextRequest('http://localhost:3000/api/v1/payments/webhook?data.id=tx-failed', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=abc', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ data: { id: 'tx-failed' } }),
  })
}

const FAILED_EVENT = {
  eventType: 'PAYMENT_FAILED' as const,
  transactionId: 'tx-failed',
  subscriptionId: 'sub-failing',
  amount: 3990,
  gateway: 'MERCADO_PAGO',
  rawPayload: '{}',
}

/**
 * Configura o cenário de PAYMENT_FAILED. `expiresAt` controla o ramo de coalesce:
 *  - Date  -> vigência existente, deve ser preservada (não sobrescrever).
 *  - null  -> sem vigência (ex.: PENDING que nunca ativou), deve ser carimbada now().
 */
function setupFailedPayment(expiresAt: Date | null) {
  const { prisma } = require('@/lib/prisma')
  mockParseWebhookEvent.mockResolvedValue(FAILED_EVENT)
  prisma.webhookAuditLog.findFirst.mockResolvedValue(null) // sem duplicata ACCEPTED
  prisma.subscription.findUnique.mockResolvedValue({
    userId: 'user-1',
    planType: 'CRAQUE',
    expiresAt,
  })
  prisma.subscription.updateMany.mockResolvedValue({ count: 1 })
  prisma.payment.upsert.mockResolvedValue({ id: 'pay-1', status: 'FAILED' })
}

async function callWebhook() {
  const { POST } = await import('@/app/api/v1/payments/webhook/route')
  return POST(webhookRequest())
}

function subscriptionUpdateCalls() {
  const { prisma } = require('@/lib/prisma')
  return (prisma.subscription.updateMany as jest.Mock).mock.calls.map((c) => c[0])
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('FIX-04 — PAST_DUE não é mais um estado-sink', () => {
  it('PAYMENT_FAILED transiciona a assinatura para EXPIRED, nunca para PAST_DUE', async () => {
    setupFailedPayment(new Date('2030-01-01T00:00:00Z'))

    const res = await callWebhook()

    expect(res.status).toBe(200)
    const calls = subscriptionUpdateCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].where).toEqual({ id: 'sub-failing', status: { in: ['ACTIVE', 'PENDING'] } })
    expect(calls[0].data.status).toBe('EXPIRED')
    // Invariante central: nenhuma escrita de subscription pode gravar o sink PAST_DUE.
    const writtenStatuses = calls.map((c) => c.data.status)
    expect(writtenStatuses).not.toContain('PAST_DUE')
  })

  it('preserva uma vigência futura existente (não sobrescreve expiresAt)', async () => {
    setupFailedPayment(new Date('2030-01-01T00:00:00Z'))

    await callWebhook()

    const data = subscriptionUpdateCalls()[0].data
    // expiresAt não é tocado quando já existe — só status muda.
    expect(data.expiresAt).toBeUndefined()
    expect(data.status).toBe('EXPIRED')
  })

  it('carimba expiresAt=now() quando a assinatura não tem vigência (evita deref nulo no DunningService)', async () => {
    setupFailedPayment(null)

    await callWebhook()

    const data = subscriptionUpdateCalls()[0].data
    // EXPIRED com expiresAt nulo seria selecionado pelo DunningService (sem filtro de
    // expiresAt) e cairia no deref `expiresAt!.getTime()`. O carimbo garante âncora temporal.
    expect(data.status).toBe('EXPIRED')
    expect(data.expiresAt).toBeInstanceOf(Date)
  })

  it('registra o Payment FAILED idempotente por gatewayTransactionId', async () => {
    setupFailedPayment(new Date('2030-01-01T00:00:00Z'))
    const { prisma } = require('@/lib/prisma')

    await callWebhook()

    expect(prisma.payment.upsert).toHaveBeenCalledTimes(1)
    const upsertArg = prisma.payment.upsert.mock.calls[0][0]
    expect(upsertArg.where).toEqual({ gatewayTransactionId: 'tx-failed' })
    expect(upsertArg.update.status).toBe('FAILED')
    expect(upsertArg.create.status).toBe('FAILED')
  })
})
