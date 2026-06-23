/**
 * Testes unitarios — Higiene P3 (Task 24): POST /api/v1/payments/webhook.
 *
 * Cobre:
 *  - ST003: deduplicação de múltiplos PIX `approved` para o mesmo payment.id — plano migra
 *    UMA vez (segundo evento ACCEPTED prévio vira DUPLICATE, sem reprocessar).
 *  - ST007: validação do planType castado — planType inválido/não-pagável é rejeitado
 *    explicitamente, sem migrar para "plano indefinido".
 *  - ST008: early-return idempotente no REFUND_COMPLETED — Payment já REFUNDED não dispara
 *    dupla reversão.
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/env', () => ({
  env: { AUTO_REFUND_ON_ORPHAN: 'false', NEXT_PUBLIC_APP_URL: 'https://test.footstock', NODE_ENV: 'test' },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    payment: { upsert: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
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

jest.mock('@/lib/gateways/webhook-validator', () => ({
  validateWebhookByGatewayDetailed: jest.fn().mockResolvedValue({ valid: true }),
}))

jest.mock('@/lib/ratelimit', () => ({
  getWebhookRateLimit: jest.fn(() => ({
    limit: jest.fn().mockResolvedValue({ success: true, remaining: 999, reset: Date.now() + 60000 }),
  })),
}))

jest.mock('@/middleware/rateLimit', () => ({ normalizeIp: jest.fn((ip: string) => ip) }))

const upgradeUserMock = jest.fn()
jest.mock('@/lib/services/PlanService', () => ({
  planService: {
    upgradeUser: (...a: unknown[]) => upgradeUserMock(...a),
    applyPaymentConfirmedEffects: jest.fn().mockResolvedValue(undefined),
  },
}))

const logWebhookMock = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/services/WebhookAuditService', () => ({
  webhookAuditService: { logWebhook: (...a: unknown[]) => logWebhookMock(...a) },
}))

jest.mock('@/lib/services/analytics/MixpanelServerService', () => ({
  mixpanelServer: { trackPaymentFailed: jest.fn(), trackPaymentCompleted: jest.fn() },
}))

jest.mock('@/lib/services/forced-liquidation', () => ({
  liquidateRestrictedPositions: jest.fn().mockResolvedValue({ cleared: true }),
}))

import { POST } from '@/app/api/v1/payments/webhook/route'
import { prisma } from '@/lib/prisma'

const sub = (prisma as unknown as { subscription: Record<string, jest.Mock> }).subscription
const pay = (prisma as unknown as { payment: Record<string, jest.Mock> }).payment
const auditLog = (prisma as unknown as { webhookAuditLog: Record<string, jest.Mock> }).webhookAuditLog

function webhookRequest(txId = 'tx-1'): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/payments/webhook?data.id=${txId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=abc', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ data: { id: txId } }),
  })
}

const PAYMENT_EVENT = {
  eventType: 'PAYMENT_CONFIRMED' as const,
  transactionId: 'tx-1',
  subscriptionId: 'sub-1',
  amount: 3990,
  gateway: 'MERCADO_PAGO',
  rawPayload: '{}',
}

const REFUND_EVENT = {
  eventType: 'REFUND_COMPLETED' as const,
  transactionId: 'tx-refund',
  subscriptionId: 'sub-1',
  amount: 3990,
  gateway: 'MERCADO_PAGO',
  rawPayload: '{}',
}

beforeEach(() => {
  jest.clearAllMocks()
  logWebhookMock.mockResolvedValue(undefined)
  auditLog.findFirst.mockResolvedValue(null) // sem duplicata ACCEPTED por padrão
  pay.findUnique.mockResolvedValue(null)
  pay.upsert.mockResolvedValue({ id: 'p1', status: 'CAPTURED_NOT_ACTIVATED' })
  upgradeUserMock.mockResolvedValue('ACTIVATED')
})

// ─── ST003: dedup de múltiplos PIX approved ──────────────────────────────────
describe('ST003 — dedup de múltiplos PIX approved', () => {
  it('happy: primeiro PAYMENT_CONFIRMED processa (upgradeUser chamado)', async () => {
    mockParseWebhookEvent.mockResolvedValue(PAYMENT_EVENT)
    sub.findUnique.mockResolvedValue({
      userId: 'u1', planType: 'CRAQUE', period: 'MONTHLY', amount: 3990, gateway: 'MERCADO_PAGO',
    })
    const res = await POST(webhookRequest('tx-1'))
    expect(res.status).toBe(200)
    expect(upgradeUserMock).toHaveBeenCalledTimes(1)
  })

  it('sad: segunda notificação do mesmo payment.id (já ACCEPTED) => DUPLICATE, NÃO migra de novo', async () => {
    mockParseWebhookEvent.mockResolvedValue(PAYMENT_EVENT)
    auditLog.findFirst.mockResolvedValue({ id: 'log-accepted', status: 'ACCEPTED' })
    const res = await POST(webhookRequest('tx-1'))
    expect(res.status).toBe(200)
    expect(upgradeUserMock).not.toHaveBeenCalled()
    expect(logWebhookMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'DUPLICATE' }))
  })
})

// ─── ST007: validar planType castado ─────────────────────────────────────────
describe('ST007 — validar planType castado', () => {
  it('happy: planType CRAQUE => prossegue para ativação', async () => {
    mockParseWebhookEvent.mockResolvedValue(PAYMENT_EVENT)
    sub.findUnique.mockResolvedValue({
      userId: 'u1', planType: 'CRAQUE', period: 'MONTHLY', amount: 3990, gateway: 'MERCADO_PAGO',
    })
    await POST(webhookRequest('tx-1'))
    expect(upgradeUserMock).toHaveBeenCalledTimes(1)
  })

  it('sad: planType JOGADOR (não-pagável) => REJECTED, NÃO migra (upgradeUser não chamado)', async () => {
    mockParseWebhookEvent.mockResolvedValue(PAYMENT_EVENT)
    sub.findUnique.mockResolvedValue({
      userId: 'u1', planType: 'JOGADOR', period: 'MONTHLY', amount: 3990, gateway: 'MERCADO_PAGO',
    })
    const res = await POST(webhookRequest('tx-1'))
    expect(res.status).toBe(200)
    expect(upgradeUserMock).not.toHaveBeenCalled()
    expect(logWebhookMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'REJECTED', errorMessage: expect.stringContaining('planType inválido') })
    )
  })

  it('sad: planType lixo/desconhecido => REJECTED, NÃO migra', async () => {
    mockParseWebhookEvent.mockResolvedValue(PAYMENT_EVENT)
    sub.findUnique.mockResolvedValue({
      userId: 'u1', planType: 'PLANO_FANTASMA', period: 'MONTHLY', amount: 3990, gateway: 'MERCADO_PAGO',
    })
    const res = await POST(webhookRequest('tx-1'))
    expect(res.status).toBe(200)
    expect(upgradeUserMock).not.toHaveBeenCalled()
  })
})

// ─── ST008: early-return idempotente no REFUND_COMPLETED ──────────────────────
describe('ST008 — REFUND_COMPLETED idempotente', () => {
  it('sad: Payment já REFUNDED => early-return DUPLICATE, sem reprocessar (refundedSub não buscado)', async () => {
    mockParseWebhookEvent.mockResolvedValue(REFUND_EVENT)
    pay.findUnique.mockResolvedValue({ status: 'REFUNDED' })
    const res = await POST(webhookRequest('tx-refund'))
    expect(res.status).toBe(200)
    expect(sub.findUnique).not.toHaveBeenCalled() // não chegou a buscar a sub para downgrade
    expect(logWebhookMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'DUPLICATE' }))
  })

  it('happy: refund ainda não processado => prossegue (busca a sub para downgrade)', async () => {
    mockParseWebhookEvent.mockResolvedValue(REFUND_EVENT)
    pay.findUnique.mockResolvedValue(null)
    sub.findUnique.mockResolvedValue(null) // sub não encontrada -> 503, mas já provou que passou do guard
    const res = await POST(webhookRequest('tx-refund'))
    expect(pay.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { gatewayTransactionId: 'tx-refund' } })
    )
    expect(sub.findUnique).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(503)
  })
})
