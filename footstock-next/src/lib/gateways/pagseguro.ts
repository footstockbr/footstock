// ============================================================================
// FootStock — PagSeguroGateway: redirect checkout + HMAC webhook
// PCI-DSS: dados de cartão NUNCA passam por este gateway — redirect apenas
// Referência: PAYMENT_020 (amount inválido), PAYMENT_050 (gateway indisponível),
//             PAYMENT_051 (URL inválida), PAYMENT_053 (token inválido)
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto'
import type { IGateway, GatewayCheckoutInput, GatewayCheckoutResult, GatewaySubscriptionInput, GatewaySubscriptionResult, WebhookEvent } from './IGateway'
import { GATEWAY_TIMEOUT_MS } from '@/lib/constants/payment-security'
import { env } from '@/lib/env'

// ─── Erros tipados do gateway ─────────────────────────────────────────────────

class GatewayError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode = 422) {
    super(message)
    this.name = 'GatewayError'
  }
}

// ─── Implementação ────────────────────────────────────────────────────────────

export class PagSeguroGateway implements IGateway {
  readonly name = 'PAGSEGURO'

  private get apiBase(): string {
    const isSandbox = process.env.PAGSEGURO_SANDBOX !== 'false'
    return isSandbox
      ? 'https://sandbox.api.pagseguro.com'
      : 'https://api.pagseguro.com'
  }

  // ─── createCheckout ────────────────────────────────────────────────────────

  async createCheckout(input: GatewayCheckoutInput): Promise<GatewayCheckoutResult> {
    if (!input.amount || input.amount <= 0) {
      throw new GatewayError('Valor de checkout inválido', 'PAYMENT_020', 422)
    }
    if (!input.successUrl || !input.failureUrl || !input.pendingUrl) {
      throw new GatewayError('URL de redirecionamento inválida', 'PAYMENT_051', 422)
    }

    const token = env.PAGSEGURO_TOKEN
    if (!token) {
      throw new GatewayError('[PAYMENT_053] PAGSEGURO_TOKEN não configurado', 'PAYMENT_053', 500)
    }

    const webhookUrl = `${env.NEXT_PUBLIC_APP_URL}/api/v1/payments/webhook`

    try {
      const response = await fetch(`${this.apiBase}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference_id: input.subscriptionId,
          customer: { email: input.userEmail },
          items: [{
            name: `FootStock - Plano ${input.planType}`,
            quantity: 1,
            unit_amount: input.amount, // centavos
          }],
          notification_urls: [webhookUrl],
          redirect_url: input.successUrl,
        }),
        signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      })

      if (response.status === 401) {
        throw new GatewayError('Token PagSeguro inválido', 'PAYMENT_053', 401)
      }

      if (!response.ok) {
        throw new GatewayError(`PagSeguro retornou ${response.status}`, 'PAYMENT_050', 503)
      }

      const data = await response.json() as {
        id: string
        links?: Array<{ rel: string; href: string }>
      }

      const payLink = data.links?.find((l) => l.rel === 'PAY')?.href
        ?? data.links?.find((l) => l.rel === 'CHECKOUT')?.href

      if (!payLink) {
        throw new GatewayError('Link de pagamento ausente na resposta PagSeguro', 'PAYMENT_050', 503)
      }

      return {
        redirectUrl:   payLink,
        transactionId: data.id,
      }
    } catch (err) {
      if (err instanceof GatewayError) throw err
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      throw new GatewayError(`Gateway PagSeguro indisponível: ${msg}`, 'PAYMENT_050', 503)
    }
  }

  // ─── validateWebhook ───────────────────────────────────────────────────────

  /**
   * @deprecated Esquema HMAC LEGADO (assina o payload com PAGSEGURO_WEBHOOK_SECRET).
   * A autenticidade real do webhook PagBank `/orders` e validada via
   * `x-authenticity-token` (SHA-256 `{token}-{payload}`) por
   * `validatePagBankAuthenticity` em lib/gateways/webhook-validator.ts (Item 008),
   * que e o caminho usado pela rota POST /api/v1/payments/webhook. Este metodo
   * permanece apenas para compatibilidade do contrato IGateway e nao deve ser a
   * prova primaria de autenticidade.
   */
  validateWebhook(payload: string, signature: string, secret: string): boolean {
    try {
      if (!signature) return false

      const expected    = createHmac('sha256', secret).update(payload, 'utf8').digest('hex')
      const expectedBuf = Buffer.from(expected, 'utf8')
      const receivedBuf = Buffer.from(signature, 'utf8')

      if (expectedBuf.length !== receivedBuf.length) {
        timingSafeEqual(expectedBuf, Buffer.alloc(expectedBuf.length))
        return false
      }

      return timingSafeEqual(expectedBuf, receivedBuf)
    } catch {
      return false
    }
  }

  // ─── parseWebhookEvent ────────────────────────────────────────────────────

  async parseWebhookEvent(payload: string): Promise<WebhookEvent> {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>
    } catch {
      throw new Error(`[PAGSEGURO] Payload JSON malformado: ${payload.substring(0, 200)}`)
    }

    // PagSeguro: charges[0].status ou status no nível raiz
    const charges = parsed.charges as Array<Record<string, unknown>> | undefined
    const status  = (charges?.[0]?.status as string)
      ?? (parsed.status as string)
      ?? ''

    const refId = (parsed.reference_id as string)
      ?? (charges?.[0]?.reference_id as string)
      ?? ''

    if (!refId) {
      throw new Error('[PAGSEGURO] subscriptionId (reference_id) ausente no evento')
    }

    const transactionId = (parsed.id as string)
      ?? (charges?.[0]?.id as string)
      ?? ''

    // FIX-19: o amount do payload e INFORMATIVO, nunca autoritativo para liquidacao.
    // O handler do webhook (api/v1/payments/webhook) compara event.amount contra
    // subscription.amount (valor gravado no checkout) e rejeita divergencias — um
    // payload nao pode inflar/forjar o valor cobrado. Enquanto PagSeguro nao esta
    // habilitado no seletor (ver lib/constants/checkout-gateways), nenhuma
    // Subscription PAGSEGURO e criada e este caminho nao e exercitado em producao.
    const amount = ((charges?.[0]?.amount as Record<string, number>)?.value
      ?? (parsed.amount as Record<string, number>)?.value
      ?? 0)

    let eventType: WebhookEvent['eventType']

    if (status === 'PAID') {
      eventType = 'PAYMENT_CONFIRMED'
    } else if (status === 'DECLINED' || status === 'CANCELED') {
      eventType = 'PAYMENT_FAILED'
    } else if (status === 'REFUNDED') {
      eventType = 'REFUND_COMPLETED'
    } else {
      console.warn(`[PAGSEGURO] status não mapeado: ${status} — descartando evento`)
      throw new Error(`[PAGSEGURO] status não mapeado: ${status}`)
    }

    return {
      eventType,
      transactionId,
      subscriptionId: refId,
      amount,
      gateway:    'PAGSEGURO',
      rawPayload: payload,
    }
  }

  async createSubscription(_input: GatewaySubscriptionInput): Promise<GatewaySubscriptionResult> {
    // Assinatura recorrente PagSeguro não implementada (D1). Falha terminal explícita 501 —
    // NUNCA retorna undefined nem stub silencioso para que o chamador não trate uma cobrança
    // recorrente inexistente como configurada.
    throw new GatewayError(
      '[PAGSEGURO] createSubscription não implementado — assinatura recorrente pendente',
      'PAYMENT_058',
      501,
    )
  }

  async cancelAutoRenewal(gatewaySubscriptionId: string): Promise<void> {
    console.warn(`[PAGSEGURO] cancelAutoRenewal stub — integração pendente. subscriptionId: ${gatewaySubscriptionId}`)
  }

  async reactivateAutoRenewal(gatewaySubscriptionId: string): Promise<void> {
    console.warn(`[PAGSEGURO] reactivateAutoRenewal stub — integração pendente. subscriptionId: ${gatewaySubscriptionId}`)
  }

  async refundPayment(gatewayTransactionId: string): Promise<import('./IGateway').RefundResult> {
    // Integração de estorno PagSeguro pendente. Falha terminal explícita para que o
    // chamador NÃO rebaixe o plano achando que estornou.
    throw new GatewayError(
      `[PAGSEGURO] refundPayment não implementado — estorno manual necessário para ${gatewayTransactionId}`,
      'PAYMENT_057',
      501,
    )
  }
}
