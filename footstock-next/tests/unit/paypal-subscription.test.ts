// ============================================================================
// PayPal Subscriptions — mapeamento de webhook de assinatura recorrente
// (branches puros; SALE com custom_id presente não faz enrichment de rede)
// ============================================================================

jest.mock('@/lib/env', () => ({
  env: {
    PAYPAL_PLAN_IDS: '{"CRAQUE_monthly":"P-CRAQUE-M","LENDA_monthly":"P-LENDA-M"}',
    PAYPAL_SANDBOX: 'true',
    PAYPAL_CLIENT_ID: 'id',
    PAYPAL_CLIENT_SECRET: 'sec',
  },
}))

import { PayPalGateway } from '@/lib/gateways/paypal'

const gw = new PayPalGateway()

describe('PayPal parseWebhookEvent — assinatura recorrente', () => {
  it('BILLING.SUBSCRIPTION.ACTIVATED -> PAYMENT_CONFIRMED (ativa via custom_id + last_payment)', async () => {
    const payload = JSON.stringify({
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: { id: 'I-1', custom_id: 'sub-interno-1', billing_info: { last_payment: { amount: { value: '1.00' } } } },
    })
    const ev = await gw.parseWebhookEvent(payload)
    expect(ev.eventType).toBe('PAYMENT_CONFIRMED')
    expect(ev.subscriptionId).toBe('sub-interno-1')
    expect(ev.amount).toBe(100)
    expect(ev.transactionId).toBe('paypal-activation-I-1') // marcador estável -> ativa 1x
  })

  it('PAYMENT.SALE.COMPLETED com custom_id -> SUBSCRIPTION_RENEWED (sem enrichment)', async () => {
    const payload = JSON.stringify({
      event_type: 'PAYMENT.SALE.COMPLETED',
      resource: { id: 'SALE-9', billing_agreement_id: 'I-1', custom_id: 'sub-interno-1', amount: { total: '1.00' } },
    })
    const ev = await gw.parseWebhookEvent(payload)
    expect(ev.eventType).toBe('SUBSCRIPTION_RENEWED')
    expect(ev.subscriptionId).toBe('sub-interno-1')
    expect(ev.transactionId).toBe('SALE-9') // único por ciclo (dedup)
    expect(ev.amount).toBe(100)
  })

  it('PAYMENT.SALE.COMPLETED sem billing_agreement_id -> lança (não é ciclo de assinatura)', async () => {
    const payload = JSON.stringify({ event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'SALE-9', amount: { total: '1.00' } } })
    await expect(gw.parseWebhookEvent(payload)).rejects.toThrow(/billing_agreement_id/)
  })

  it('BILLING.SUBSCRIPTION.CANCELLED -> SUBSCRIPTION_CANCELLED', async () => {
    const payload = JSON.stringify({ event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: 'I-1', custom_id: 'sub-interno-1' } })
    const ev = await gw.parseWebhookEvent(payload)
    expect(ev.eventType).toBe('SUBSCRIPTION_CANCELLED')
    expect(ev.subscriptionId).toBe('sub-interno-1')
  })

  it('BILLING.SUBSCRIPTION.EXPIRED -> SUBSCRIPTION_CANCELLED', async () => {
    const payload = JSON.stringify({ event_type: 'BILLING.SUBSCRIPTION.EXPIRED', resource: { id: 'I-1', custom_id: 'sub-interno-1' } })
    const ev = await gw.parseWebhookEvent(payload)
    expect(ev.eventType).toBe('SUBSCRIPTION_CANCELLED')
  })

  it('BILLING.SUBSCRIPTION.PAYMENT.FAILED -> SUBSCRIPTION_PAYMENT_FAILED (id por evento p/ não colapsar ciclos)', async () => {
    const payload = JSON.stringify({ id: 'WH-EVT-42', event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED', resource: { id: 'I-1', custom_id: 'sub-interno-1' } })
    const ev = await gw.parseWebhookEvent(payload)
    expect(ev.eventType).toBe('SUBSCRIPTION_PAYMENT_FAILED')
    expect(ev.transactionId).toBe('paypal-subfail-WH-EVT-42') // usa o webhook event id, não o id da assinatura
  })

  it('BILLING.SUBSCRIPTION.SUSPENDED NÃO é acionado (nosso /suspend é pausa voluntária, não dunning)', async () => {
    // SUSPENDED saiu de SUBSCRIPTION_EVENT_TYPES -> cai no ramo one-time -> sem reference_id -> lança
    const payload = JSON.stringify({ event_type: 'BILLING.SUBSCRIPTION.SUSPENDED', resource: { id: 'I-1', custom_id: 'sub-interno-1' } })
    await expect(gw.parseWebhookEvent(payload)).rejects.toThrow()
  })

  it('BILLING.SUBSCRIPTION.* sem custom_id -> lança (subscriptionId interno ausente)', async () => {
    const payload = JSON.stringify({ event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: { id: 'I-1' } })
    await expect(gw.parseWebhookEvent(payload)).rejects.toThrow(/custom_id/)
  })

  it('one-time PAYMENT.CAPTURE.COMPLETED NÃO regride (continua PAYMENT_CONFIRMED via reference_id)', async () => {
    const payload = JSON.stringify({
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: { id: 'CAP-1', purchase_units: [{ reference_id: 'sub-ot-1' }], amount: { value: '1.00' } },
    })
    const ev = await gw.parseWebhookEvent(payload)
    expect(ev.eventType).toBe('PAYMENT_CONFIRMED')
    expect(ev.subscriptionId).toBe('sub-ot-1')
  })
})
