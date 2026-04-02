/**
 * @jest-environment node
 */
// ============================================================================
// Foot Stock — Testes unitários: PagSeguroGateway
// Cobre: createCheckout, validateWebhook (HMAC), parseWebhookEvent
// ============================================================================

import { createHmac } from 'crypto'
import { PagSeguroGateway } from '../pagseguro'
import type { GatewayCheckoutInput } from '../IGateway'

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/env', () => ({
  env: {
    PAGSEGURO_TOKEN: 'test-pagseguro-token-valid',
    NEXT_PUBLIC_APP_URL: 'https://foot-stock.app',
  },
}))

jest.mock('@/lib/constants/payment-security', () => ({
  GATEWAY_TIMEOUT_MS: 5000,
  WEBHOOK_REPLAY_WINDOW_MS: 300000,
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SECRET = 'pagseguro-webhook-secret-very-safe'

function makeSignature(payload: string): string {
  return createHmac('sha256', SECRET).update(payload, 'utf8').digest('hex')
}

const BASE_INPUT: GatewayCheckoutInput = {
  planType: 'CRAQUE',
  period: 'monthly',
  amount: 4990,
  currency: 'BRL',
  subscriptionId: 'sub_abc123',
  userId: 'user_xyz',
  userEmail: 'test@foot-stock.app',
  successUrl: 'https://foot-stock.app/success',
  failureUrl: 'https://foot-stock.app/failure',
  pendingUrl: 'https://foot-stock.app/pending',
}

function makeOrderResponse(payLink = 'https://pagseguro.uol.com.br/checkout/123') {
  return {
    ok: true,
    status: 201,
    json: async () => ({
      id: 'order_pag_001',
      links: [{ rel: 'PAY', href: payLink }],
    }),
  }
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('PagSeguroGateway', () => {
  let gateway: PagSeguroGateway

  beforeEach(() => {
    gateway = new PagSeguroGateway()
    mockFetch.mockReset()
  })

  // ─── createCheckout ────────────────────────────────────────────────────────

  describe('createCheckout', () => {
    it('retorna redirectUrl e transactionId quando API responde com sucesso', async () => {
      mockFetch.mockResolvedValue(makeOrderResponse())

      const result = await gateway.createCheckout(BASE_INPUT)

      expect(result.redirectUrl).toBe('https://pagseguro.uol.com.br/checkout/123')
      expect(result.transactionId).toBe('order_pag_001')
    })

    it('lança PAYMENT_020 quando amount <= 0', async () => {
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

    it('lança PAYMENT_053 quando API retorna 401', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_053',
      })
    })

    it('lança PAYMENT_050 quando API retorna 503', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_050',
      })
    })

    it('lança PAYMENT_050 quando link PAY está ausente', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ id: 'order_002', links: [] }),
      })

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_050',
      })
    })

    it('lança PAYMENT_050 quando fetch lança erro de rede', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      await expect(gateway.createCheckout(BASE_INPUT)).rejects.toMatchObject({
        code: 'PAYMENT_050',
      })
    })

    it('passa unit_amount em centavos (não divide por 100)', async () => {
      mockFetch.mockResolvedValue(makeOrderResponse())

      await gateway.createCheckout({ ...BASE_INPUT, amount: 4990 })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.items[0].unit_amount).toBe(4990)
    })
  })

  // ─── validateWebhook ───────────────────────────────────────────────────────

  describe('validateWebhook', () => {
    it('valida assinatura HMAC correta', () => {
      const payload = JSON.stringify({ status: 'PAID', reference_id: 'sub_1' })
      const sig = makeSignature(payload)

      expect(gateway.validateWebhook(payload, sig, SECRET)).toBe(true)
    })

    it('rejeita assinatura incorreta', () => {
      const payload = JSON.stringify({ status: 'PAID' })
      expect(gateway.validateWebhook(payload, 'wrong-sig', SECRET)).toBe(false)
    })

    it('rejeita payload adulterado (mesmo com sig original)', () => {
      const original = JSON.stringify({ status: 'PAID', reference_id: 'sub_1' })
      const sig = makeSignature(original)
      const tampered = JSON.stringify({ status: 'PAID', reference_id: 'sub_1', injected: true })

      expect(gateway.validateWebhook(tampered, sig, SECRET)).toBe(false)
    })

    it('rejeita assinatura vazia', () => {
      expect(gateway.validateWebhook('{}', '', SECRET)).toBe(false)
    })

    it('rejeita com secret errado', () => {
      const payload = JSON.stringify({ status: 'PAID' })
      const sig = makeSignature(payload)
      expect(gateway.validateWebhook(payload, sig, 'wrong-secret-aaaaaaaaaaaaa')).toBe(false)
    })
  })

  // ─── parseWebhookEvent ────────────────────────────────────────────────────

  describe('parseWebhookEvent', () => {
    it('mapeia status PAID para PAYMENT_CONFIRMED', () => {
      const payload = JSON.stringify({
        id: 'charge_1',
        reference_id: 'sub_abc',
        charges: [{ id: 'charge_1', status: 'PAID', amount: { value: 49.9 } }],
      })
      const event = gateway.parseWebhookEvent(payload)
      expect(event.eventType).toBe('PAYMENT_CONFIRMED')
      expect(event.subscriptionId).toBe('sub_abc')
    })

    it('mapeia status DECLINED para PAYMENT_FAILED', () => {
      const payload = JSON.stringify({
        id: 'charge_2',
        reference_id: 'sub_abc',
        charges: [{ status: 'DECLINED', amount: { value: 49.9 } }],
      })
      expect(gateway.parseWebhookEvent(payload).eventType).toBe('PAYMENT_FAILED')
    })

    it('mapeia status CANCELED para PAYMENT_FAILED', () => {
      const payload = JSON.stringify({
        reference_id: 'sub_abc',
        charges: [{ status: 'CANCELED', amount: { value: 49.9 } }],
      })
      expect(gateway.parseWebhookEvent(payload).eventType).toBe('PAYMENT_FAILED')
    })

    it('mapeia status REFUNDED para REFUND_COMPLETED', () => {
      const payload = JSON.stringify({
        reference_id: 'sub_abc',
        charges: [{ status: 'REFUNDED', amount: { value: 49.9 } }],
      })
      expect(gateway.parseWebhookEvent(payload).eventType).toBe('REFUND_COMPLETED')
    })

    it('lança erro para status desconhecido', () => {
      const payload = JSON.stringify({
        reference_id: 'sub_abc',
        charges: [{ status: 'PROCESSING', amount: { value: 49.9 } }],
      })
      expect(() => gateway.parseWebhookEvent(payload)).toThrow(/status não mapeado/)
    })

    it('lança erro quando reference_id está ausente', () => {
      const payload = JSON.stringify({ charges: [{ status: 'PAID', amount: { value: 10 } }] })
      expect(() => gateway.parseWebhookEvent(payload)).toThrow(/subscriptionId.*ausente/)
    })

    it('lança erro quando payload não é JSON válido', () => {
      expect(() => gateway.parseWebhookEvent('invalid')).toThrow(/JSON malformado/)
    })

    it('retorna gateway = PAGSEGURO', () => {
      const payload = JSON.stringify({
        reference_id: 'sub_abc',
        charges: [{ status: 'PAID', amount: { value: 49.9 } }],
      })
      expect(gateway.parseWebhookEvent(payload).gateway).toBe('PAGSEGURO')
    })
  })
})
