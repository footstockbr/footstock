/**
 * @jest-environment node
 */
// ============================================================================
// Foot Stock — Testes unitários: PayPalGateway
// Cobre: createCheckout, validateWebhook (delegado à Verify API), parseWebhookEvent
// ============================================================================

import { PayPalGateway } from '../paypal'
import type { GatewayCheckoutInput } from '../IGateway'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/env', () => ({
  env: {
    PAYPAL_CLIENT_ID: 'test-client-id',
    PAYPAL_CLIENT_SECRET: 'test-client-secret',
    PAYPAL_WEBHOOK_ID: 'test-webhook-id',
    NEXT_PUBLIC_APP_URL: 'https://foot-stock.app',
  },
}))

jest.mock('@/lib/constants/payment-security', () => ({
  GATEWAY_TIMEOUT_MS: 5000,
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_INPUT: GatewayCheckoutInput = {
  planType: 'LENDA',
  period: 'yearly',
  amount: 9990,
  currency: 'BRL',
  subscriptionId: 'sub_lenda_001',
  userId: 'user_vip',
  userEmail: 'vip@foot-stock.app',
  successUrl: 'https://foot-stock.app/success',
  failureUrl: 'https://foot-stock.app/failure',
  pendingUrl: 'https://foot-stock.app/pending',
}

function mockTokenResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ access_token: 'pp-access-token-123' }),
  }
}

function mockOrderResponse(approveUrl = 'https://www.paypal.com/checkoutnow?token=EC-123') {
  return {
    ok: true,
    status: 201,
    json: async () => ({
      id: 'ORDER-PP-001',
      status: 'CREATED',
      links: [
        { rel: 'self', href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/ORDER-PP-001' },
        { rel: 'approve', href: approveUrl },
        { rel: 'update', href: '...' },
        { rel: 'capture', href: '...' },
      ],
    }),
  }
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PayPalGateway', () => {
  let gateway: PayPalGateway

  beforeEach(() => {
    gateway = new PayPalGateway()
    mockFetch.mockReset()
  })

  // ─── createCheckout ────────────────────────────────────────────────────────

  describe('createCheckout', () => {
    it('retorna redirectUrl e transactionId quando API responde com sucesso', async () => {
      mockFetch
        .mockResolvedValueOnce(mockTokenResponse())
        .mockResolvedValueOnce(mockOrderResponse())

      const result = await gateway.createCheckout(BASE_INPUT)

      expect(result.redirectUrl).toBe('https://www.paypal.com/checkoutnow?token=EC-123')
      expect(result.transactionId).toBe('ORDER-PP-001')
    })

    it('lança PAYMENT_020 quando amount <= 0 (sem chamar fetch)', async () => {
      await expect(gateway.createCheckout({ ...BASE_INPUT, amount: 0 })).rejects.toMatchObject({
        code: 'PAYMENT_020',
      })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('lança PAYMENT_051 quando URL de retorno está ausente', async () => {
      await expect(
        gateway.createCheckout({ ...BASE_INPUT, successUrl: '' })
      ).rejects.toMatchObject({ code: 'PAYMENT_051' })
    })

    it('lança PAYMENT_053 quando credenciais são inválidas (401 no token)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401, text: async () => '' })

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_053',
      })
    })

    it('lança PAYMENT_050 quando orders API retorna 500', async () => {
      mockFetch
        .mockResolvedValueOnce(mockTokenResponse())
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Server Error' })

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_050',
      })
    })

    it('lança PAYMENT_050 quando link "approve" está ausente', async () => {
      mockFetch
        .mockResolvedValueOnce(mockTokenResponse())
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: async () => ({ id: 'ORDER-002', links: [{ rel: 'self', href: '...' }] }),
        })

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_050',
      })
    })

    it('lança PAYMENT_050 quando fetch lança erro de rede', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'))

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_050',
      })
    })

    it('passa amount em formato decimal (centavos / 100)', async () => {
      mockFetch
        .mockResolvedValueOnce(mockTokenResponse())
        .mockResolvedValueOnce(mockOrderResponse())

      await gateway.createCheckout({ ...BASE_INPUT, amount: 9990 })

      const orderBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(orderBody.purchase_units[0].amount.value).toBe('99.90')
    })
  })

  // ─── validateWebhook ───────────────────────────────────────────────────────

  describe('validateWebhook', () => {
    it('retorna false (PayPal requer validação async via Verify API)', () => {
      expect(gateway.validateWebhook('{}', 'sig', 'secret')).toBe(false)
    })
  })

  // ─── parseWebhookEvent ────────────────────────────────────────────────────

  describe('parseWebhookEvent', () => {
    const makePayload = (eventType: string, refId = 'sub_lenda_001') =>
      JSON.stringify({
        event_type: eventType,
        resource: {
          id: 'capture_001',
          amount: { value: '99.90', currency_code: 'BRL' },
          purchase_units: [{ reference_id: refId }],
        },
      })

    it('mapeia PAYMENT.CAPTURE.COMPLETED para PAYMENT_CONFIRMED', () => {
      const event = gateway.parseWebhookEvent(makePayload('PAYMENT.CAPTURE.COMPLETED'))
      expect(event.eventType).toBe('PAYMENT_CONFIRMED')
      expect(event.subscriptionId).toBe('sub_lenda_001')
      expect(event.amount).toBe(9990) // R$ 99.90 × 100
    })

    it('mapeia CHECKOUT.ORDER.APPROVED para PAYMENT_CONFIRMED', () => {
      expect(gateway.parseWebhookEvent(makePayload('CHECKOUT.ORDER.APPROVED')).eventType)
        .toBe('PAYMENT_CONFIRMED')
    })

    it('mapeia PAYMENT.CAPTURE.DENIED para PAYMENT_FAILED', () => {
      expect(gateway.parseWebhookEvent(makePayload('PAYMENT.CAPTURE.DENIED')).eventType)
        .toBe('PAYMENT_FAILED')
    })

    it('mapeia CHECKOUT.ORDER.VOIDED para PAYMENT_FAILED', () => {
      expect(gateway.parseWebhookEvent(makePayload('CHECKOUT.ORDER.VOIDED')).eventType)
        .toBe('PAYMENT_FAILED')
    })

    it('mapeia PAYMENT.CAPTURE.REFUNDED para REFUND_COMPLETED', () => {
      expect(gateway.parseWebhookEvent(makePayload('PAYMENT.CAPTURE.REFUNDED')).eventType)
        .toBe('REFUND_COMPLETED')
    })

    it('mapeia PAYMENT.CAPTURE.REVERSED para REFUND_COMPLETED', () => {
      expect(gateway.parseWebhookEvent(makePayload('PAYMENT.CAPTURE.REVERSED')).eventType)
        .toBe('REFUND_COMPLETED')
    })

    it('lança erro para event_type desconhecido', () => {
      expect(() => gateway.parseWebhookEvent(makePayload('BILLING.SUBSCRIPTION.CREATED')))
        .toThrow(/event_type não mapeado/)
    })

    it('lança erro quando payload não é JSON válido', () => {
      expect(() => gateway.parseWebhookEvent('invalid')).toThrow(/JSON malformado/)
    })

    it('retorna gateway = PAYPAL', () => {
      expect(gateway.parseWebhookEvent(makePayload('PAYMENT.CAPTURE.COMPLETED')).gateway)
        .toBe('PAYPAL')
    })
  })
})
