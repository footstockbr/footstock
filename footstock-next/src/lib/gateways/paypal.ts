// ============================================================================
// FootStock — PayPalGateway: redirect checkout + Verify API webhook
// PCI-DSS: dados de cartão NUNCA passam por este gateway — redirect apenas
// Referência: PAYMENT_020 (amount inválido), PAYMENT_050 (gateway indisponível),
//             PAYMENT_051 (URL inválida), PAYMENT_053 (credenciais inválidas)
// ============================================================================

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

export class PayPalGateway implements IGateway {
  readonly name = 'PAYPAL'

  private get apiBase(): string {
    const isSandbox = process.env.PAYPAL_SANDBOX !== 'false'
    if (isSandbox && process.env.NODE_ENV === 'production') {
      // RESOLVED: PayPal sandbox não deve estar ativo em produção
      throw new GatewayError(
        '[PAYMENT_053] PAYPAL_SANDBOX não foi definido como "false" em produção. Defina PAYPAL_SANDBOX=false no ambiente de produção.',
        'PAYMENT_053',
        500
      )
    }
    return isSandbox
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com'
  }

  // ─── Autenticação ──────────────────────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    const clientId     = env.PAYPAL_CLIENT_ID ?? ''
    const clientSecret = env.PAYPAL_CLIENT_SECRET ?? ''

    if (!clientId || !clientSecret) {
      throw new GatewayError('[PAYMENT_053] PAYPAL_CLIENT_ID ou PAYPAL_CLIENT_SECRET não configurados', 'PAYMENT_053', 500)
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const res = await fetch(`${this.apiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    })

    if (res.status === 401) {
      throw new GatewayError('Credenciais PayPal inválidas', 'PAYMENT_053', 401)
    }
    if (!res.ok) {
      throw new GatewayError(`PayPal auth retornou ${res.status}`, 'PAYMENT_050', 503)
    }

    const data = await res.json() as { access_token: string }
    return data.access_token
  }

  // ─── createCheckout ────────────────────────────────────────────────────────

  async createCheckout(input: GatewayCheckoutInput): Promise<GatewayCheckoutResult> {
    if (!input.amount || input.amount <= 0) {
      throw new GatewayError('Valor de checkout inválido', 'PAYMENT_020', 422)
    }
    if (!input.successUrl || !input.failureUrl || !input.pendingUrl) {
      throw new GatewayError('URL de redirecionamento inválida', 'PAYMENT_051', 422)
    }

    try {
      const accessToken = await this.getAccessToken()

      const res = await fetch(`${this.apiBase}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: input.subscriptionId,
            amount: {
              currency_code: input.currency ?? 'BRL',
              value: (input.amount / 100).toFixed(2),
            },
            description: `FootStock - Plano ${input.planType}`,
          }],
          application_context: {
            return_url: input.successUrl,
            cancel_url: input.failureUrl,
            brand_name: 'FootStock',
            user_action: 'PAY_NOW',
          },
        }),
        signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 401) {
          throw new GatewayError('Credenciais PayPal inválidas', 'PAYMENT_053', 401)
        }
        throw new GatewayError(`PayPal retornou ${res.status}: ${body.substring(0, 200)}`, 'PAYMENT_050', 503)
      }

      const order = await res.json() as {
        id: string
        links: Array<{ rel: string; href: string }>
      }

      const approveLink = order.links.find((l) => l.rel === 'approve')?.href
      if (!approveLink) {
        throw new GatewayError('Link "approve" ausente na resposta PayPal', 'PAYMENT_050', 503)
      }

      return {
        redirectUrl:   approveLink,
        transactionId: order.id,
      }
    } catch (err) {
      if (err instanceof GatewayError) throw err
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      throw new GatewayError(`Gateway PayPal indisponível: ${msg}`, 'PAYMENT_050', 503)
    }
  }

  // ─── validateWebhook ───────────────────────────────────────────────────────
  // PayPal usa verificação remota via Verify API — não HMAC local

  validateWebhook(_payload: string, _signature: string, _secret: string): boolean {
    // PayPal não suporta validação HMAC local sínccrona.
    // Use validateWebhookByGateway() em webhook-validator.ts para validação async.
    // Este método é mantido para satisfazer a interface IGateway.
    return false
  }

  // ─── parseWebhookEvent ────────────────────────────────────────────────────

  async parseWebhookEvent(payload: string): Promise<WebhookEvent> {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>
    } catch {
      throw new Error(`[PAYPAL] Payload JSON malformado: ${payload.substring(0, 200)}`)
    }

    const eventType = parsed.event_type as string ?? ''
    const resource  = parsed.resource as Record<string, unknown> ?? {}

    const transactionId = (resource.id as string) ?? (parsed.id as string) ?? ''

    // Extrair subscriptionId do purchase_units[0].reference_id ou supplementary_data
    const purchaseUnits = resource.purchase_units as Array<{ reference_id?: string }> | undefined
    const supplementaryData = resource.supplementary_data as
      | { related_ids?: { order_id?: string } }
      | undefined
    const refId = purchaseUnits?.[0]?.reference_id
      ?? supplementaryData?.related_ids?.order_id
      ?? (parsed.resource_id as string)
      ?? ''

    if (!refId && !purchaseUnits?.length) {
      throw new Error('[PAYPAL] subscriptionId (reference_id) ausente no evento')
    }

    // FIX-19: o amount do payload e INFORMATIVO, nunca autoritativo para liquidacao.
    // O handler do webhook (api/v1/payments/webhook) compara event.amount contra
    // subscription.amount (valor gravado no checkout) e rejeita divergencias — um
    // payload nao pode inflar/forjar o valor cobrado. Enquanto PayPal nao esta
    // habilitado no seletor (ver lib/constants/checkout-gateways), nenhuma
    // Subscription PAYPAL e criada e este caminho nao e exercitado em producao.
    const amountValue = (resource.amount as { value?: string } | undefined)?.value
    const captureAmount = amountValue ? parseFloat(amountValue) * 100 : 0

    let mappedEventType: WebhookEvent['eventType']

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        mappedEventType = 'PAYMENT_CONFIRMED'
        break
      case 'CHECKOUT.ORDER.APPROVED':
        // CHECKOUT.ORDER.APPROVED = pedido aprovado, NÃO captura concluída.
        // Tratar como PAYMENT_CONFIRMED aqui ativaria plano antes do dinheiro ser capturado.
        // O evento correto para ativação é PAYMENT.CAPTURE.COMPLETED.
        console.warn(`[PAYPAL] CHECKOUT.ORDER.APPROVED descartado — aguardar PAYMENT.CAPTURE.COMPLETED`)
        throw new Error('[PAYPAL] CHECKOUT.ORDER.APPROVED: aguardar PAYMENT.CAPTURE.COMPLETED para ativar plano')
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED':
      case 'CHECKOUT.ORDER.VOIDED':
        mappedEventType = 'PAYMENT_FAILED'
        break
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.REVERSED':
        mappedEventType = 'REFUND_COMPLETED'
        break
      default:
        console.warn(`[PAYPAL] event_type não mapeado: ${eventType} — descartando evento`)
        throw new Error(`[PAYPAL] event_type não mapeado: ${eventType}`)
    }

    return {
      eventType:      mappedEventType,
      transactionId,
      subscriptionId: refId ?? purchaseUnits?.[0]?.reference_id ?? '',
      amount:         captureAmount,
      gateway:        'PAYPAL',
      rawPayload:     payload,
    }
  }

  async createSubscription(_input: GatewaySubscriptionInput): Promise<GatewaySubscriptionResult> {
    // Assinatura recorrente PayPal (Billing Subscriptions API) não implementada (D1). Falha
    // terminal explícita 501 — NUNCA retorna undefined nem stub silencioso para que o chamador
    // não trate uma cobrança recorrente inexistente como configurada.
    throw new GatewayError(
      '[PAYPAL] createSubscription não implementado — assinatura recorrente pendente',
      'PAYMENT_058',
      501,
    )
  }

  async cancelAutoRenewal(gatewaySubscriptionId: string): Promise<void> {
    console.warn(`[PAYPAL] cancelAutoRenewal stub — integração pendente. subscriptionId: ${gatewaySubscriptionId}`)
  }

  async reactivateAutoRenewal(gatewaySubscriptionId: string): Promise<void> {
    console.warn(`[PAYPAL] reactivateAutoRenewal stub — integração pendente. subscriptionId: ${gatewaySubscriptionId}`)
  }

  async refundPayment(gatewayTransactionId: string): Promise<import('./IGateway').RefundResult> {
    // Integração de estorno PayPal pendente. Falha terminal explícita para que o
    // chamador NÃO rebaixe o plano achando que estornou.
    throw new GatewayError(
      `[PAYPAL] refundPayment não implementado — estorno manual necessário para ${gatewayTransactionId}`,
      'PAYMENT_057',
      501,
    )
  }
}
