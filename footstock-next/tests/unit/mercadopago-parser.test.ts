/**
 * Testes unitários — MercadoPagoGateway.parseWebhookEvent
 * D9: precedência de operador confirmava pagamento em payment.created sem approved.
 * Follow-up: notificação só com data.id resolve status real via GET /v1/payments/{id}.
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

beforeEach(() => {
  // Default: enrichment fetch falha (HTTP 404) → fetchPaymentStatus retorna null. Para eventos
  // type=payment isso sinaliza erro TRANSITÓRIO (retryable), nunca confirmação. Garante também
  // que nenhum teste faça chamada de rede real.
  ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue({ ok: false, status: 404 })
})

describe('MercadoPagoGateway.parseWebhookEvent — confirmação só em approved (D9)', () => {
  it('payment.created/type=payment SEM status: fetch indisponível é TRANSITÓRIO (retryable), NÃO confirma', async () => {
    // HIGH webhook-retryable: enriquecimento indeterminado vira GatewayRetryableError para
    // que o webhook responda 5xx e o provedor reentregue, em vez de descartar como terminal.
    await expect(
      gateway.parseWebhookEvent(
        payload({ type: 'payment', action: 'payment.created', data: { id: 'm1', external_reference: 'sub_1' } })
      )
    ).rejects.toThrow(/retry/)
  })

  it('status=approved no root confirma', async () => {
    const ev = await gateway.parseWebhookEvent(
      payload({ type: 'payment', status: 'approved', data: { id: 'm2', external_reference: 'sub_2', transaction_amount: 29.9 } })
    )
    expect(ev.eventType).toBe('PAYMENT_CONFIRMED')
    expect(ev.subscriptionId).toBe('sub_2')
    expect(ev.transactionId).toBe('m2')
    expect(ev.amount).toBe(2990)
    expect(global.fetch).not.toHaveBeenCalled() // status presente → sem enrichment
  })

  it('status=approved dentro de data confirma', async () => {
    const ev = await gateway.parseWebhookEvent(
      payload({ type: 'payment', data: { id: 'm3', external_reference: 'sub_3', status: 'approved', transaction_amount: 10 } })
    )
    expect(ev.eventType).toBe('PAYMENT_CONFIRMED')
  })

  it('payment.created com status=pending NÃO confirma (PIX criado, ainda não pago)', async () => {
    await expect(
      gateway.parseWebhookEvent(
        payload({ type: 'payment', action: 'payment.created', status: 'pending', data: { id: 'm4', external_reference: 'sub_4' } })
      )
    ).rejects.toThrow(/não mapeado/)
    expect(global.fetch).not.toHaveBeenCalled() // status presente → sem enrichment
  })

  it('rejected mapeia PAYMENT_FAILED', async () => {
    const ev = await gateway.parseWebhookEvent(
      payload({ type: 'payment', status: 'rejected', data: { id: 'm5', external_reference: 'sub_5' } })
    )
    expect(ev.eventType).toBe('PAYMENT_FAILED')
  })

  it('refunded mapeia REFUND_COMPLETED', async () => {
    const ev = await gateway.parseWebhookEvent(
      payload({ type: 'payment', status: 'refunded', data: { id: 'm6', external_reference: 'sub_6' } })
    )
    expect(ev.eventType).toBe('REFUND_COMPLETED')
  })

  it('payload sem external_reference lança erro de subscriptionId ausente', async () => {
    await expect(
      gateway.parseWebhookEvent(payload({ type: 'payment', status: 'approved', data: { id: 'm7' } }))
    ).rejects.toThrow(/external_reference/)
  })

  it('payload só com data.id e sem type NÃO dispara fetch — rejeição (status não mapeado)', async () => {
    await expect(
      gateway.parseWebhookEvent(payload({ data: { id: 'm8', external_reference: 'sub_8' } }))
    ).rejects.toThrow(/não mapeado/)
    expect(global.fetch).not.toHaveBeenCalled() // type != payment → sem enrichment
  })
})

describe('MercadoPagoGateway.parseWebhookEvent — enrichment GET /v1/payments/{id} (follow-up D9)', () => {
  it('notificação só com data.id: fetch retorna approved → confirma e preenche extRef/amount', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'approved', external_reference: 'sub_9', transaction_amount: 49.9 }),
    })

    const ev = await gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: 'm9' } }))

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/v1/payments/m9')
    expect(ev.eventType).toBe('PAYMENT_CONFIRMED')
    expect(ev.subscriptionId).toBe('sub_9')
    expect(ev.amount).toBe(4990)
  })

  it('external_reference do GET diverge do payload → rejeita (anti-confusão de assinatura)', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'approved', external_reference: 'sub_OUTRA', transaction_amount: 10 }),
    })

    await expect(
      gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: 'm11', external_reference: 'sub_ESPERADA' } }))
    ).rejects.toThrow(/divergente/)
  })

  it('fetch retorna pending → NÃO confirma (rejeita), nunca ativação indevida', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'pending', external_reference: 'sub_10' }),
    })

    await expect(
      gateway.parseWebhookEvent(payload({ type: 'payment', data: { id: 'm10', external_reference: 'sub_10' } }))
    ).rejects.toThrow(/não mapeado/)
  })
})
