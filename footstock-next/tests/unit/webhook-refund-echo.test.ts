/**
 * Testes unitários — M066: eco idempotente de estorno parcial NOSSO no webhook
 * REFUND_COMPLETED. Um refund iniciado pelo ledger upgrade-proration NÃO pode
 * disparar os efeitos de estorno EXTERNO (cancelar sub, anular comissões, rebaixar
 * plano): o webhook apenas confirma (WEBHOOK_CONFIRMED) e consolida o Payment se o
 * caminho síncrono não concluiu (crash-gap).
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/env', () => ({
  env: { AUTO_REFUND_ON_ORPHAN: 'false', NEXT_PUBLIC_APP_URL: 'https://test.footstock', NODE_ENV: 'test' },
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    payment: {
      upsert: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    paymentRefund: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    affiliateTransaction: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    webhookAuditLog: { findFirst: jest.fn().mockResolvedValue(null) },
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
jest.mock('@/lib/services/forced-liquidation', () => ({
  liquidateRestrictedPositions: jest.fn().mockResolvedValue({ cleared: true, remaining: 0, failed: 0 }),
}))
// F2 (consolidação única): o webhook delega a matemática financeira ao service — aqui só
// se asserta a DELEGAÇÃO e a ausência de efeitos externos (a matemática é coberta em
// upgrade-proration.test.ts).
jest.mock('@/lib/services/upgrade-proration', () => ({
  consolidateExpectedRefund: jest.fn().mockResolvedValue('STATUS_ONLY'),
}))

import { prisma } from '@/lib/prisma'
import { consolidateExpectedRefund } from '@/lib/services/upgrade-proration'

const sub = prisma.subscription as unknown as Record<string, jest.Mock>
const pay = prisma.payment as unknown as Record<string, jest.Mock>
const pr = prisma.paymentRefund as unknown as Record<string, jest.Mock>
const consolidateMock = consolidateExpectedRefund as unknown as jest.Mock

function webhookRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/payments/webhook?data.id=167033565774', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': 'ts=1,v1=abc', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify({ data: { id: '167033565774' } }),
  })
}

const REFUND_EVENT = {
  eventType: 'REFUND_COMPLETED' as const,
  transactionId: '167033565774',
  subscriptionId: 'sub-old',
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
  mockParseWebhookEvent.mockResolvedValue(REFUND_EVENT)
  pr.updateMany.mockResolvedValue({ count: 1 })
  pay.updateMany.mockResolvedValue({ count: 1 })
  ;(prisma.webhookAuditLog.findFirst as jest.Mock).mockResolvedValue(null)
})

describe('REFUND_COMPLETED — eco de estorno parcial nosso (M066)', () => {
  it('happy: ledger esperado => delega ao consolidate (WEBHOOK_CONFIRMED), audit ACCEPTED, ZERO efeitos externos', async () => {
    pr.findFirst.mockResolvedValue({
      id: 'ref-1', paymentId: 'pay-db-1', gatewayPaymentId: '167033565774',
      amountCents: 45, status: 'SUCCEEDED', expected: true,
    })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    // F2: o webhook NÃO tem lógica financeira própria — delega à consolidação única
    expect(consolidateMock).toHaveBeenCalledWith('ref-1', { toStatus: 'WEBHOOK_CONFIRMED' })
    // NENHUM efeito de estorno externo: sub não cancelada, comissões intactas, Payment intocado aqui
    expect(pay.updateMany).not.toHaveBeenCalled()
    expect(sub.update).not.toHaveBeenCalled()
    expect(prisma.affiliateTransaction.updateMany).not.toHaveBeenCalled()
    expect(auditStatuses()).toEqual(['ACCEPTED'])
  })

  it('sad: sem ledger esperado => segue a política de estorno EXTERNO (ST008 dedup intacto)', async () => {
    pr.findFirst.mockResolvedValue(null)
    // ST008: Payment já REFUNDED => DUPLICATE early-return (comportamento pré-existente preservado)
    pay.findUnique.mockResolvedValue({ status: 'REFUNDED' })

    const res = await callWebhook()

    expect(res.status).toBe(200)
    expect(auditStatuses()).toEqual(['DUPLICATE'])
    expect(consolidateMock).not.toHaveBeenCalled()
  })
})
