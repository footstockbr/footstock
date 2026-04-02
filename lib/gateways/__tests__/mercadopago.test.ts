// ============================================================================
// Foot Stock — Testes unitários: MercadoPagoGateway
// Cobre: createCheckout, validateWebhook (HMAC), parseWebhookEvent
// Referência: PAYMENT_020, PAYMENT_050, PAYMENT_051, PAYMENT_001
// ============================================================================

import { createHmac } from 'crypto'
import { MercadoPagoGateway } from '../mercadopago'
import type { GatewayCheckoutInput } from '../IGateway'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/env', () => ({
  env: {
    MERCADO_PAGO_ACCESS_TOKEN: 'test-access-token-valid-enough',
    NEXT_PUBLIC_APP_URL: 'https://foot-stock.app',
  },
}))

jest.mock('@/lib/constants/payment-security', () => ({
  CHECKOUT_EXPIRY_MINUTES: 30,
  GATEWAY_TIMEOUT_MS: 5000,
  WEBHOOK_REPLAY_WINDOW_MS: 5 * 60 * 1000,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECRET = 'webhook-secret-very-safe-min-20-chars'

function buildSignature(notificationId: string, ts: number): string {
  const template = `id:${notificationId};ts:${ts};`
  const v1 = createHmac('sha256', SECRET).update(template).digest('hex')
  return `ts=${ts},v1=${v1}`
}

function buildPayload(status: string, notificationId = 'pay_123', extRef = 'sub_abc'): string {
  return JSON.stringify({
    type: 'payment',
    action: status === 'approved' ? 'payment.created' : 'payment.updated',
    status,
    data: {
      id: notificationId,
      external_reference: extRef,
      transaction_amount: 29.9,
      status,
    },
  })
}

const BASE_INPUT: GatewayCheckoutInput = {
  planType: 'CRAQUE',
  period: 'monthly',
  amount: 2990,
  currency: 'BRL',
  subscriptionId: 'sub_abc123',
  userId: 'user_xyz',
  userEmail: 'test@foot-stock.app',
  successUrl: 'https://foot-stock.app/success',
  failureUrl: 'https://foot-stock.app/failure',
  pendingUrl: 'https://foot-stock.app/pending',
}

// Fake fetch helper
function mockFetchResponse(body: object, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response)
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('MercadoPagoGateway', () => {
  let gateway: MercadoPagoGateway

  beforeEach(() => {
    gateway = new MercadoPagoGateway()
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ─── createCheckout ────────────────────────────────────────────────────────

  describe('createCheckout', () => {
    it('retorna redirectUrl e transactionId quando API responde corretamente', async () => {
      mockFetchResponse({
        id: 'pref_001',
        init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref_001',
      })

      const result = await gateway.createCheckout(BASE_INPUT)

      expect(result.redirectUrl).toBe(
        'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref_001'
      )
      expect(result.transactionId).toBe('pref_001')
      expect(result.expiresAt).toBeDefined()
    })

    it('passa amount em formato decimal (centavos / 100)', async () => {
      mockFetchResponse({ id: 'pref_002', init_point: 'https://mp.com/ok' })

      await gateway.createCheckout({ ...BASE_INPUT, amount: 5000 })

      const call = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(call[1].body as string)
      expect(body.items[0].unit_price).toBe(50) // 5000 centavos = R$ 50
    })

    it('lança PAYMENT_020 quando amount <= 0', async () => {
      await expect(gateway.createCheckout({ ...BASE_INPUT, amount: 0 })).rejects.toMatchObject({
        code: 'PAYMENT_020',
      })
      await expect(gateway.createCheckout({ ...BASE_INPUT, amount: -1 })).rejects.toMatchObject({
        code: 'PAYMENT_020',
      })
    })

    it('lança PAYMENT_051 quando URL de retorno está ausente', async () => {
      await expect(
        gateway.createCheckout({ ...BASE_INPUT, successUrl: '' })
      ).rejects.toMatchObject({ code: 'PAYMENT_051' })

      await expect(
        gateway.createCheckout({ ...BASE_INPUT, failureUrl: undefined as unknown as string })
      ).rejects.toMatchObject({ code: 'PAYMENT_051' })
    })

    it('lança PAYMENT_050 quando init_point está ausente na resposta', async () => {
      mockFetchResponse({ id: 'pref_003', init_point: null })

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_050',
      })
    })

    it('lança PAYMENT_050 quando API lança erro de rede', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network timeout'))

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_050',
      })
    })

    it('inclui external_reference igual a subscriptionId', async () => {
      mockFetchResponse({ id: 'pref_004', init_point: 'https://mp.com/ok' })

      await gateway.createCheckout(BASE_INPUT)

      const call = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(call[1].body as string)
      expect(body.external_reference).toBe(BASE_INPUT.subscriptionId)
    })

    it('configura back_urls corretamente', async () => {
      mockFetchResponse({ id: 'pref_005', init_point: 'https://mp.com/ok' })

      await gateway.createCheckout(BASE_INPUT)

      const call = (global.fetch as jest.Mock).mock.calls[0]
      const body = JSON.parse(call[1].body as string)
      expect(body.back_urls.success).toBe(BASE_INPUT.successUrl)
      expect(body.back_urls.failure).toBe(BASE_INPUT.failureUrl)
      expect(body.back_urls.pending).toBe(BASE_INPUT.pendingUrl)
    })
  })

  // ─── validateWebhook ───────────────────────────────────────────────────────

  describe('validateWebhook', () => {
    it('valida assinatura HMAC correta (timingSafeEqual)', () => {
      const ts = Math.floor(Date.now() / 1000)
      const payload = buildPayload('approved')
      const sig = buildSignature('pay_123', ts)

      expect(gateway.validateWebhook(payload, sig, SECRET)).toBe(true)
    })

    it('rejeita assinatura com v1 errado', () => {
      const ts = Math.floor(Date.now() / 1000)
      const payload = buildPayload('approved')
      const sig = `ts=${ts},v1=000000000000000000000000000000000000000000000000000000000000000`

      expect(gateway.validateWebhook(payload, sig, SECRET)).toBe(false)
    })

    it('rejeita timestamp expirado (> 5 min)', () => {
      const oldTs = Math.floor((Date.now() - 6 * 60 * 1000) / 1000)
      const payload = buildPayload('approved')
      const sig = buildSignature('pay_123', oldTs)

      expect(gateway.validateWebhook(payload, sig, SECRET)).toBe(false)
    })

    it('rejeita assinatura malformada (sem v1=)', () => {
      const payload = buildPayload('approved')
      expect(gateway.validateWebhook(payload, 'ts=12345,broken', SECRET)).toBe(false)
    })

    it('rejeita payload JSON malformado', () => {
      const ts = Math.floor(Date.now() / 1000)
      const sig = `ts=${ts},v1=abc`
      expect(gateway.validateWebhook('not-json', sig, SECRET)).toBe(false)
    })

    it('rejeita assinatura com secret errado', () => {
      const ts = Math.floor(Date.now() / 1000)
      const payload = buildPayload('approved')
      const sig = buildSignature('pay_123', ts)

      expect(gateway.validateWebhook(payload, sig, 'wrong-secret-aaaaaaaaaaaa')).toBe(false)
    })
  })

  // ─── parseWebhookEvent ────────────────────────────────────────────────────

  describe('parseWebhookEvent', () => {
    it('mapeia status "approved" para PAYMENT_CONFIRMED', () => {
      const event = gateway.parseWebhookEvent(buildPayload('approved'))
      expect(event.eventType).toBe('PAYMENT_CONFIRMED')
      expect(event.subscriptionId).toBe('sub_abc')
      expect(event.transactionId).toBe('pay_123')
      expect(event.amount).toBe(2990) // R$ 29.90 × 100
    })

    it('mapeia status "rejected" para PAYMENT_FAILED', () => {
      const event = gateway.parseWebhookEvent(buildPayload('rejected'))
      expect(event.eventType).toBe('PAYMENT_FAILED')
    })

    it('mapeia status "cancelled" para PAYMENT_FAILED', () => {
      const event = gateway.parseWebhookEvent(buildPayload('cancelled'))
      expect(event.eventType).toBe('PAYMENT_FAILED')
    })

    it('mapeia status "refunded" para REFUND_COMPLETED', () => {
      const event = gateway.parseWebhookEvent(buildPayload('refunded'))
      expect(event.eventType).toBe('REFUND_COMPLETED')
    })

    it('mapeia status "charged_back" para REFUND_COMPLETED', () => {
      const event = gateway.parseWebhookEvent(buildPayload('charged_back'))
      expect(event.eventType).toBe('REFUND_COMPLETED')
    })

    it('lança erro para status desconhecido', () => {
      expect(() => gateway.parseWebhookEvent(buildPayload('pending'))).toThrow(
        /status não mapeado/
      )
    })

    it('lança erro quando external_reference está ausente', () => {
      const payload = JSON.stringify({ type: 'payment', action: 'payment.created', data: { id: 'pay_1' } })
      expect(() => gateway.parseWebhookEvent(payload)).toThrow(/subscriptionId.*ausente/)
    })

    it('lança erro quando payload não é JSON válido', () => {
      expect(() => gateway.parseWebhookEvent('invalid')).toThrow(/JSON malformado/)
    })

    it('retorna gateway = MERCADO_PAGO no evento', () => {
      const event = gateway.parseWebhookEvent(buildPayload('approved'))
      expect(event.gateway).toBe('MERCADO_PAGO')
    })
  })
})
