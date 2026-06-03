/**
 * Testes unitários — MercadoPagoGateway.parseWebhookEvent
 *
 * Contrato HARDENED (D9+): para `type=payment`, o parser SEMPRE resolve o status
 * real via GET /v1/payments/{id} e IGNORA status/external_reference/amount do
 * payload (não cobertos pelo HMAC — um payload forjado poderia alterá-los com um
 * data.id legítimo). `data.id` deve ser numérico. Só 'approved' confirma.
 * Fonte: blacksmith/brainstorm-mcp/05-24-foot-stock-bugfix-tasks-ciclo-assinatura.md (task-002)
 */

jest.mock('@/lib/env', () => ({
  env: {
    MERCADO_PAGO_ACCESS_TOKEN: 'test-token',
    NEXT_PUBLIC_APP_URL: 'https://example.test',
  },
}))

import { MercadoPagoGateway } from '@/lib/gateways/mercadopago'

const gateway = new MercadoPagoGateway()

function payload(obj: Record<string, unknown>): string {
  return JSON.stringify(obj)
}

/** Stub do GET /v1/payments/{id} com o corpo resolvido pelo MP. */
function mockFetchJson(body: Record<string, unknown>, ok = true, status = 200) {
  ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok, status, json: async () => body })
}

beforeEach(() => {
  // Default: enrichment fetch falha (HTTP 404) → fetchPaymentStatus retorna null → o
  // chamador trata como status indeterminado (retryable), nunca confirma. Garante
  // também que nenhum teste faça chamada de rede real.
  ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: false, status: 404 })
})

describe('parseWebhookEvent — type=payment SEMPRE busca via API e ignora o payload (D9+)', () => {
  it('fetch indisponível (HTTP != 2xx) → erro TRANSITÓRIO (retryable), nunca confirma', async () => {
    // HIGH webhook-retryable: enriquecimento indeterminado vira GatewayRetryableError
    // para o webhook responder 5xx e o provedor reentregar, em vez de descartar.
    await expect(
      gateway.parseWebhookEvent(
        payload({ type: 'payment', action: 'payment.created', data: { id: '111000001', external_reference: 'sub_1' } })
      )
    ).rejects.toThrow(/retry/)
  })

  it('data.id não-numérico → rejeita (formato inválido) antes de qualquer fetch', async () => {
    await expect(
      gateway.parseWebhookEvent(
        payload({ type: 'payment', data: { id: 'abc', external_reference: 'sub_x' } })
      )
    ).rejects.toThrow(/formato inválido/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fetch retorna approved → PAYMENT_CONFIRMED com subscriptionId/amount DO FETCH', async () => {
    mockFetchJson({ status: 'approved', external_reference: 'sub_2', transaction_amount: 29.9 })
    const ev = await gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: '111000002' } }))
    expect(ev.eventType).toBe('PAYMENT_CONFIRMED')
    expect(ev.subscriptionId).toBe('sub_2')
    expect(ev.transactionId).toBe('111000002')
    expect(ev.amount).toBe(2990)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('payload diz approved mas o FETCH retorna pending → NÃO confirma (payload ignorado)', async () => {
    mockFetchJson({ status: 'pending', external_reference: 'sub_3' })
    await expect(
      gateway.parseWebhookEvent(
        payload({ type: 'payment', status: 'approved', data: { id: '111000003', external_reference: 'sub_3', transaction_amount: 999 } })
      )
    ).rejects.toThrow(/não mapeado/)
  })

  it('fetch rejected → PAYMENT_FAILED', async () => {
    mockFetchJson({ status: 'rejected', external_reference: 'sub_4' })
    const ev = await gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: '111000004' } }))
    expect(ev.eventType).toBe('PAYMENT_FAILED')
  })

  it('fetch cancelled → PAYMENT_FAILED', async () => {
    mockFetchJson({ status: 'cancelled', external_reference: 'sub_5' })
    const ev = await gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: '111000005' } }))
    expect(ev.eventType).toBe('PAYMENT_FAILED')
  })

  it('fetch refunded → REFUND_COMPLETED', async () => {
    mockFetchJson({ status: 'refunded', external_reference: 'sub_6' })
    const ev = await gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: '111000006' } }))
    expect(ev.eventType).toBe('REFUND_COMPLETED')
  })

  it('fetch charged_back → REFUND_COMPLETED', async () => {
    mockFetchJson({ status: 'charged_back', external_reference: 'sub_7' })
    const ev = await gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: '111000007' } }))
    expect(ev.eventType).toBe('REFUND_COMPLETED')
  })

  it('fetch sem external_reference → erro de subscriptionId ausente', async () => {
    mockFetchJson({ status: 'approved', transaction_amount: 10 })
    await expect(
      gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: '111000008', external_reference: 'sub_payload' } }))
    ).rejects.toThrow(/external_reference/)
  })

  it('external_reference do FETCH é autoritativo (ignora o do payload)', async () => {
    mockFetchJson({ status: 'approved', external_reference: 'sub_FETCH', transaction_amount: 10 })
    const ev = await gateway.parseWebhookEvent(
      payload({ type: 'payment', data: { id: '111000009', external_reference: 'sub_PAYLOAD' } })
    )
    expect(ev.subscriptionId).toBe('sub_FETCH')
  })
})

describe('parseWebhookEvent — eventos sem data.id / não-payment NÃO disparam fetch', () => {
  it('topic != payment (sem type) → sem fetch, rejeita por external_reference ausente', async () => {
    await expect(
      gateway.parseWebhookEvent(payload({ data: { id: '111000010', external_reference: 'sub_8' } }))
    ).rejects.toThrow(/external_reference/)
    expect(global.fetch).not.toHaveBeenCalled() // topic != payment → sem enrichment
  })

  it('sem data.id → sem fetch, rejeita por external_reference ausente', async () => {
    await expect(
      gateway.parseWebhookEvent(payload({ type: 'payment' }))
    ).rejects.toThrow(/external_reference/)
    expect(global.fetch).not.toHaveBeenCalled() // sem data.id → sem enrichment
  })
})

describe('parseWebhookEvent — enrichment GET /v1/payments/{id}', () => {
  it('chama GET /v1/payments/{id} com o data.id e preenche extRef/amount do retorno', async () => {
    mockFetchJson({ status: 'approved', external_reference: 'sub_9', transaction_amount: 49.9 })
    const ev = await gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: '111000099' } }))
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/v1/payments/111000099')
    expect(ev.eventType).toBe('PAYMENT_CONFIRMED')
    expect(ev.subscriptionId).toBe('sub_9')
    expect(ev.amount).toBe(4990)
  })
})
