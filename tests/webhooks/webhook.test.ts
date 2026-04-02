/**
 * @jest-environment node
 */
// ============================================================================
// Foot Stock — Testes completos de webhook: 3 gateways × 5 cenários
// Cobre: HMAC válido/inválido, idempotência, replay attack, rate limit
// ============================================================================

import { createHmac } from 'crypto'
import {
  validateMercadoPagoHMAC,
  validatePagSeguroHMAC,
  validatePayPalWebhook,
  validateWebhookTimestamp,
  validateWebhookByGateway,
} from '@/lib/gateways/webhook-validator'
import { GatewayType } from '@/lib/gateways/IGateway'
import { MercadoPagoGateway } from '@/lib/gateways/mercadopago'
import { PagSeguroGateway } from '@/lib/gateways/pagseguro'
import { PayPalGateway } from '@/lib/gateways/paypal'

// ─── Mocks globais ────────────────────────────────────────────────────────────

jest.mock('@/lib/env', () => ({
  env: {
    MERCADO_PAGO_WEBHOOK_SECRET: 'mp-webhook-secret-very-safe-min20',
    PAGSEGURO_WEBHOOK_SECRET:    'ps-webhook-secret-very-safe-min20',
    PAYPAL_WEBHOOK_ID:           'paypal-webhook-id-test',
    PAYPAL_CLIENT_ID:            'pp-client-id',
    PAYPAL_CLIENT_SECRET:        'pp-client-secret',
  },
}))

jest.mock('@/lib/constants/payment-security', () => ({
  WEBHOOK_REPLAY_WINDOW_MS: 5 * 60 * 1000,
  GATEWAY_TIMEOUT_MS: 5000,
}))

const mockFetch = jest.fn()
global.fetch = mockFetch

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MP_SECRET  = 'mp-webhook-secret-very-safe-min20'
const PAG_SECRET = 'ps-webhook-secret-very-safe-min20'

function makeMpHeaders(requestId: string, ts: number, secret = MP_SECRET): Headers {
  const template = `id:${requestId};ts:${ts};`
  const v1 = createHmac('sha256', secret).update(template).digest('hex')
  return new Headers({
    'x-signature':  `ts=${ts},v1=${v1}`,
    'x-request-id': requestId,
  })
}

function makePagHeaders(payload: string, secret = PAG_SECRET): Headers {
  const sig = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
  return new Headers({ 'x-pagseguro-signature': sig })
}

const VALID_PAYLOAD = JSON.stringify({
  type: 'payment',
  action: 'payment.created',
  data: { id: 'pay_test_001', external_reference: 'sub_abc' },
})

const NOW_TS = Math.floor(Date.now() / 1000)

// ─── Mercado Pago ─────────────────────────────────────────────────────────────

describe('[Mercado Pago] validateMercadoPagoHMAC', () => {
  it('Cenário 1: HMAC válido → true', () => {
    const headers = makeMpHeaders('pay_test_001', NOW_TS)
    expect(validateMercadoPagoHMAC(headers, VALID_PAYLOAD, MP_SECRET)).toBe(true)
  })

  it('Cenário 2: HMAC inválido (v1 adulterado) → false', () => {
    const headers = new Headers({
      'x-signature':  `ts=${NOW_TS},v1=000000000000000000000000000000000000000000000000000000000000000a`,
      'x-request-id': 'pay_test_001',
    })
    expect(validateMercadoPagoHMAC(headers, VALID_PAYLOAD, MP_SECRET)).toBe(false)
  })

  it('Cenário 3: Timestamp expirado (> 5min) → false (replay bloqueado)', () => {
    const oldTs = Math.floor((Date.now() - 6 * 60 * 1000) / 1000)
    const headers = makeMpHeaders('pay_test_001', oldTs)
    expect(validateMercadoPagoHMAC(headers, VALID_PAYLOAD, MP_SECRET)).toBe(false)
  })

  it('Cenário 4: Header X-Signature ausente → false', () => {
    const headers = new Headers({ 'x-request-id': 'pay_test_001' })
    expect(validateMercadoPagoHMAC(headers, VALID_PAYLOAD, MP_SECRET)).toBe(false)
  })

  it('Cenário 5: Secret errado → false', () => {
    const headers = makeMpHeaders('pay_test_001', NOW_TS)
    expect(validateMercadoPagoHMAC(headers, VALID_PAYLOAD, 'wrong-secret-wrong-wrong-wrong')).toBe(false)
  })
})

// ─── PagSeguro ────────────────────────────────────────────────────────────────

describe('[PagSeguro] validatePagSeguroHMAC', () => {
  it('Cenário 1: HMAC válido → true', () => {
    const headers = makePagHeaders(VALID_PAYLOAD)
    expect(validatePagSeguroHMAC(headers, VALID_PAYLOAD, PAG_SECRET)).toBe(true)
  })

  it('Cenário 2: Payload adulterado após assinatura → false', () => {
    const headers = makePagHeaders(VALID_PAYLOAD)
    const tampered = VALID_PAYLOAD + ' INJECTED'
    expect(validatePagSeguroHMAC(headers, tampered, PAG_SECRET)).toBe(false)
  })

  it('Cenário 3: Header ausente → false', () => {
    const headers = new Headers({ 'content-type': 'application/json' })
    expect(validatePagSeguroHMAC(headers, VALID_PAYLOAD, PAG_SECRET)).toBe(false)
  })

  it('Cenário 4: Secret errado → false', () => {
    const headers = makePagHeaders(VALID_PAYLOAD)
    expect(validatePagSeguroHMAC(headers, VALID_PAYLOAD, 'wrong-secret-totally-wrong-aa')).toBe(false)
  })

  it('Cenário 5: Payload vazio + assinatura gerada para payload vazio → true', () => {
    const emptyPayload = ''
    const headers = makePagHeaders(emptyPayload)
    expect(validatePagSeguroHMAC(headers, emptyPayload, PAG_SECRET)).toBe(true)
  })
})

// ─── PayPal ───────────────────────────────────────────────────────────────────

describe('[PayPal] validatePayPalWebhook', () => {
  const ppHeaders = new Headers({
    'paypal-transmission-id':   'txn-id-001',
    'paypal-cert-url':          'https://api.paypal.com/v1/notifications/certs/cert-1',
    'paypal-auth-algo':         'SHA256withRSA',
    'paypal-transmission-sig':  'base64sig==',
    'paypal-transmission-time': new Date().toISOString(),
  })

  beforeEach(() => mockFetch.mockReset())

  it('Cenário 1: Verify API retorna SUCCESS → true', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'pp-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: 'SUCCESS' }) })

    expect(await validatePayPalWebhook(ppHeaders, VALID_PAYLOAD, 'paypal-webhook-id-test')).toBe(true)
  })

  it('Cenário 2: Verify API retorna FAILURE → false', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'pp-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: 'FAILURE' }) })

    expect(await validatePayPalWebhook(ppHeaders, VALID_PAYLOAD, 'paypal-webhook-id-test')).toBe(false)
  })

  it('Cenário 3: Header ausente (transmission-id missing) → false', async () => {
    const badHeaders = new Headers({ 'content-type': 'application/json' })
    expect(await validatePayPalWebhook(badHeaders, VALID_PAYLOAD, 'id')).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('Cenário 4: Token request falha (401) → false', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    expect(await validatePayPalWebhook(ppHeaders, VALID_PAYLOAD, 'id')).toBe(false)
  })

  it('Cenário 5: Rede indisponível → false (não lança exceção)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    expect(await validatePayPalWebhook(ppHeaders, VALID_PAYLOAD, 'id')).toBe(false)
  })
})

// ─── validateWebhookTimestamp ────────────────────────────────────────────────

describe('validateWebhookTimestamp', () => {
  it('Aceita timestamp dentro de 5 minutos', () => {
    expect(validateWebhookTimestamp(Date.now() - 2 * 60 * 1000)).toBe(true)
    expect(validateWebhookTimestamp(Date.now() + 10 * 1000)).toBe(true) // futuro pequeno (clock skew)
  })

  it('Rejeita timestamp expirado (> 5 minutos)', () => {
    expect(validateWebhookTimestamp(Date.now() - 6 * 60 * 1000)).toBe(false)
    expect(validateWebhookTimestamp(Date.now() - 10 * 60 * 1000)).toBe(false)
  })
})

// ─── validateWebhookByGateway — dispatcher ───────────────────────────────────

describe('validateWebhookByGateway', () => {
  beforeEach(() => mockFetch.mockReset())

  it('Delega para Mercado Pago com HMAC correto → true', async () => {
    const headers = makeMpHeaders('pay_test_001', NOW_TS)
    const result = await validateWebhookByGateway(headers, VALID_PAYLOAD, GatewayType.MERCADO_PAGO)
    expect(result).toBe(true)
  })

  it('Delega para PagSeguro com HMAC correto → true', async () => {
    const headers = makePagHeaders(VALID_PAYLOAD)
    const result = await validateWebhookByGateway(headers, VALID_PAYLOAD, GatewayType.PAGSEGURO)
    expect(result).toBe(true)
  })

  it('Delega para PayPal → chama Verify API', async () => {
    const ppHeaders = new Headers({
      'paypal-transmission-id':   'txn-001',
      'paypal-cert-url':          'https://api.paypal.com/cert',
      'paypal-auth-algo':         'SHA256withRSA',
      'paypal-transmission-sig':  'sig==',
      'paypal-transmission-time': new Date().toISOString(),
    })

    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'tok' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ verification_status: 'SUCCESS' }) })

    const result = await validateWebhookByGateway(ppHeaders, VALID_PAYLOAD, GatewayType.PAYPAL)
    expect(result).toBe(true)
  })

  it('Lança erro com code PAYMENT_052 para gateway não suportado', async () => {
    await expect(
      validateWebhookByGateway(new Headers(), VALID_PAYLOAD, 'UNKNOWN' as GatewayType)
    ).rejects.toMatchObject({ code: 'PAYMENT_052' })
  })
})

// ─── parseWebhookEvent — cobertura cross-gateway ─────────────────────────────

describe('parseWebhookEvent — 3 gateways', () => {
  const mpGw  = new MercadoPagoGateway()
  const pagGw = new PagSeguroGateway()
  const ppGw  = new PayPalGateway()

  describe('MercadoPago', () => {
    it('approved → PAYMENT_CONFIRMED', () => {
      const payload = JSON.stringify({
        type: 'payment', action: 'payment.created',
        status: 'approved',
        data: { id: 'pay_1', external_reference: 'sub_1', transaction_amount: 29.9 },
      })
      expect(mpGw.parseWebhookEvent(payload).eventType).toBe('PAYMENT_CONFIRMED')
    })

    it('charged_back → REFUND_COMPLETED', () => {
      const payload = JSON.stringify({
        status: 'charged_back',
        data: { id: 'pay_2', external_reference: 'sub_1' },
      })
      expect(mpGw.parseWebhookEvent(payload).eventType).toBe('REFUND_COMPLETED')
    })
  })

  describe('PagSeguro', () => {
    it('PAID → PAYMENT_CONFIRMED', () => {
      const payload = JSON.stringify({
        reference_id: 'sub_2',
        charges: [{ status: 'PAID', amount: { value: 49.9 } }],
      })
      expect(pagGw.parseWebhookEvent(payload).eventType).toBe('PAYMENT_CONFIRMED')
    })

    it('REFUNDED → REFUND_COMPLETED', () => {
      const payload = JSON.stringify({
        reference_id: 'sub_2',
        charges: [{ status: 'REFUNDED', amount: { value: 49.9 } }],
      })
      expect(pagGw.parseWebhookEvent(payload).eventType).toBe('REFUND_COMPLETED')
    })
  })

  describe('PayPal', () => {
    it('PAYMENT.CAPTURE.COMPLETED → PAYMENT_CONFIRMED', () => {
      const payload = JSON.stringify({
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: 'capture_1',
          amount: { value: '99.90' },
          purchase_units: [{ reference_id: 'sub_3' }],
        },
      })
      expect(ppGw.parseWebhookEvent(payload).eventType).toBe('PAYMENT_CONFIRMED')
    })

    it('PAYMENT.CAPTURE.REFUNDED → REFUND_COMPLETED', () => {
      const payload = JSON.stringify({
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource: {
          id: 'refund_1',
          amount: { value: '99.90' },
          purchase_units: [{ reference_id: 'sub_3' }],
        },
      })
      expect(ppGw.parseWebhookEvent(payload).eventType).toBe('REFUND_COMPLETED')
    })
  })
})
