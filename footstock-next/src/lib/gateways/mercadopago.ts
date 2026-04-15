// ============================================================================
// Foot Stock — MercadoPagoGateway: redirect checkout + HMAC webhook
// PCI-DSS: dados de cartão NUNCA passam por este gateway — redirect apenas
// Referência: PAYMENT_020 (amount inválido), PAYMENT_050 (gateway indisponível),
//             PAYMENT_051 (URL inválida), PAYMENT_001 (HMAC inválido)
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto'
import type { IGateway, GatewayCheckoutInput, GatewayCheckoutResult, WebhookEvent } from './IGateway'
import { CHECKOUT_EXPIRY_MINUTES, GATEWAY_TIMEOUT_MS, WEBHOOK_REPLAY_WINDOW_MS } from '@/lib/constants/payment-security'
import { env } from '@/lib/env'

interface MercadoPagoPreferenceResponse {
  id: string
  init_point?: string | null
  sandbox_init_point?: string | null
}

// ─── Erros tipados do gateway ─────────────────────────────────────────────────

class GatewayError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode = 422) {
    super(message)
    this.name = 'GatewayError'
  }
}

// ─── Implementação ────────────────────────────────────────────────────────────

export class MercadoPagoGateway implements IGateway {
  readonly name = 'MERCADO_PAGO'

  // ─── createCheckout ────────────────────────────────────────────────────────

  async createCheckout(input: GatewayCheckoutInput): Promise<GatewayCheckoutResult> {
    // Validações de input (PAYMENT_020, PAYMENT_051)
    if (!input.amount || input.amount <= 0) {
      throw new GatewayError('Valor de checkout inválido', 'PAYMENT_020', 422)
    }
    if (!input.successUrl || !input.failureUrl || !input.pendingUrl) {
      throw new GatewayError('URL de redirecionamento inválida', 'PAYMENT_051', 422)
    }

    const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN
    if (!accessToken) {
      throw new GatewayError('[PAYMENT_010] MP_ACCESS_TOKEN não configurado', 'PAYMENT_010', 500)
    }

    try {
      const expirationDate = new Date(Date.now() + CHECKOUT_EXPIRY_MINUTES * 60 * 1000)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS)
      let response: Response
      try {
        response = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{
              id: input.subscriptionId,
              title: `Foot Stock - Plano ${input.planType}`,
              quantity: 1,
              unit_price: input.amount / 100,
              currency_id: 'BRL',
            }],
            payer: { email: input.userEmail },
            back_urls: {
              success: input.successUrl,
              failure: input.failureUrl,
              pending: input.pendingUrl,
            },
            auto_return: 'approved',
            external_reference: input.subscriptionId,
            notification_url: `${env.NEXT_PUBLIC_APP_URL}/api/v1/payments/webhook`,
            expires: true,
            expiration_date_to: expirationDate.toISOString(),
          }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) {
        const body = await response.text()
        throw new GatewayError(
          `Mercado Pago respondeu ${response.status}: ${body.slice(0, 240)}`,
          'PAYMENT_050',
          503
        )
      }

      const result = await response.json() as MercadoPagoPreferenceResponse
      const checkoutUrl = result.init_point ?? result.sandbox_init_point ?? null
      if (!checkoutUrl) {
        throw new GatewayError('init_point ausente na resposta do gateway', 'PAYMENT_050', 503)
      }

      return {
        redirectUrl:   checkoutUrl,
        transactionId: result.id,
        expiresAt:     expirationDate.toISOString(),
      }
    } catch (err) {
      if (err instanceof GatewayError) throw err
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      throw new GatewayError(`Gateway indisponível: ${msg}`, 'PAYMENT_050', 503)
    }
  }

  // ─── validateWebhook ───────────────────────────────────────────────────────

  validateWebhook(payload: string, signature: string, secret: string): boolean {
    try {
      // signature = header X-Signature completo: "ts=1234,v1=abc..."
      // requestId deve vir do header X-Request-Id — passado como parte do payload neste contrato
      const tsMatch = signature.match(/ts=(\d+)/)
      const v1Match = signature.match(/v1=([a-f0-9]+)/i)

      if (!tsMatch || !v1Match) return false

      const ts = tsMatch[1]
      const v1 = v1Match[1]
      if (!ts || !v1) return false

      // Verificar replay (5 minutos)
      const tsMs = parseInt(ts, 10) * 1000
      if (Math.abs(Date.now() - tsMs) > WEBHOOK_REPLAY_WINDOW_MS) return false

      // Extrair notificationId do payload JSON
      let notificationId = ''
      try {
        const parsed = JSON.parse(payload) as { data?: { id?: string } }
        notificationId = parsed?.data?.id ?? ''
      } catch {
        return false
      }

      // Construir string de validação MP
      const template = `id:${notificationId};ts:${ts};`
      const expected  = createHmac('sha256', secret).update(template).digest('hex')

      const expectedBuf = Buffer.from(expected, 'utf8')
      const receivedBuf = Buffer.from(v1, 'utf8')

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

  parseWebhookEvent(payload: string): WebhookEvent {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>
    } catch {
      throw new Error(`[MERCADO_PAGO] Payload JSON malformado: ${payload.substring(0, 200)}`)
    }

    // Extrair dados do evento MP
    const type      = parsed.type as string
    const action    = parsed.action as string
    const dataId    = (parsed.data as Record<string, string>)?.id ?? ''
    const extRef    = (parsed.data as Record<string, string>)?.external_reference
                   ?? (parsed as Record<string, string>).external_reference
                   ?? ''
    const amount    = ((parsed.data as Record<string, number>)?.transaction_amount ?? 0) * 100

    if (!extRef) {
      throw new Error('[MERCADO_PAGO] subscriptionId (external_reference) ausente no evento')
    }

    // Mapear status para eventType
    let eventType: WebhookEvent['eventType']
    const mpStatus = (parsed as Record<string, string>).status
      ?? (parsed.data as Record<string, string>)?.status
      ?? ''

    if (mpStatus === 'approved' || action === 'payment.created' && type === 'payment') {
      eventType = 'PAYMENT_CONFIRMED'
    } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
      eventType = 'PAYMENT_FAILED'
    } else if (mpStatus === 'refunded' || mpStatus === 'charged_back') {
      eventType = 'REFUND_COMPLETED'
    } else {
      // Status não mapeado — descartar silenciosamente
      console.warn(`[MERCADO_PAGO] status não mapeado: ${mpStatus} — descartando evento`)
      throw new Error(`[MERCADO_PAGO] status não mapeado: ${mpStatus}`)
    }

    return {
      eventType,
      transactionId:  dataId,
      subscriptionId: extRef,
      amount,
      gateway:        'MERCADO_PAGO',
      rawPayload:     payload,
    }
  }

  /**
   * Cancela renovação automática no MercadoPago.
   * Stub: integração real requer preassignment de subscriptionId do MP.
   * TODO: implementar quando MP recorrente for integrado.
   */
  async cancelAutoRenewal(gatewaySubscriptionId: string): Promise<void> {
    console.warn(`[MERCADO_PAGO] cancelAutoRenewal stub — integração pendente. subscriptionId: ${gatewaySubscriptionId}`)
  }

  /**
   * Reativa renovação automática no MercadoPago após revert.
   * Stub: integração real requer preassignment de subscriptionId do MP.
   * TODO: implementar quando MP recorrente for integrado.
   */
  async reactivateAutoRenewal(gatewaySubscriptionId: string): Promise<void> {
    console.warn(`[MERCADO_PAGO] reactivateAutoRenewal stub — integração pendente. subscriptionId: ${gatewaySubscriptionId}`)
  }
}
