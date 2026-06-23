// ============================================================================
// FootStock — MercadoPagoGateway: redirect checkout + HMAC webhook
// PCI-DSS: dados de cartão NUNCA passam por este gateway — redirect apenas
// Referência: PAYMENT_020 (amount inválido), PAYMENT_050 (gateway indisponível),
//             PAYMENT_051 (URL inválida), PAYMENT_001 (HMAC inválido)
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto'
import type { IGateway, GatewayCheckoutInput, GatewayCheckoutResult, WebhookEvent, RefundResult } from './IGateway'
import { GatewayRetryableError } from './IGateway'
import { CHECKOUT_EXPIRY_MINUTES, GATEWAY_TIMEOUT_MS, WEBHOOK_REPLAY_WINDOW_MS } from '@/lib/constants/payment-security'
import { env } from '@/lib/env'
import { emitDegradationSignal } from '@/lib/observability/degradation-signal'

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
      throw new GatewayError('[PAYMENT_010] MERCADO_PAGO_ACCESS_TOKEN não configurado', 'PAYMENT_010', 500)
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
              title: `FootStock - Plano ${input.planType}`,
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

  /**
   * @deprecated NÃO está no caminho de produção. A rota /payments/webhook valida via
   * `validateWebhookByGatewayDetailed` (lib/gateways/webhook-validator.ts), que tem acesso
   * aos headers e monta o manifesto canônico do MP `id:{data.id};request-id:{x-request-id};ts:{ts};`.
   * Este método recebe apenas (payload, signature, secret) — sem o header x-request-id, ele
   * NÃO consegue reproduzir o manifesto real do MP e rejeitaria todo webhook legítimo. Mantido
   * só pela assinatura do IGateway; sem callers. Qualquer uso futuro deve passar pelo validator.
   */
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

  // ─── fetchPaymentStatus ────────────────────────────────────────────────────

  /**
   * Resolve o status real de um pagamento via GET /v1/payments/{id}.
   * Retorna null em QUALQUER falha (token ausente, timeout, HTTP != 2xx, JSON inválido):
   * o chamador trata null como "status indeterminado" e segue para rejeição silenciosa,
   * jamais ativando o plano sem confirmação explícita de aprovação.
   */
  private async fetchPaymentStatus(
    paymentId: string
  ): Promise<{ status?: string; externalReference?: string; amount?: number; liveMode?: boolean } | null> {
    const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN
    if (!accessToken) {
      console.warn('[MERCADO_PAGO] fetchPaymentStatus: MERCADO_PAGO_ACCESS_TOKEN ausente — sem enriquecimento')
      return null
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS)
    try {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
      if (!response.ok) {
        console.warn(`[MERCADO_PAGO] fetchPaymentStatus: HTTP ${response.status} para payment ${paymentId}`)
        return null
      }
      const body = await response.json() as {
        status?: string
        external_reference?: string
        transaction_amount?: number
        live_mode?: boolean
      }
      return {
        status:            body.status,
        externalReference: body.external_reference,
        amount:            body.transaction_amount,
        liveMode:          body.live_mode,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      console.warn(`[MERCADO_PAGO] fetchPaymentStatus falhou para payment ${paymentId}: ${msg}`)
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  // ─── getPaymentDetails (publico, reconciliacao) ────────────────────────────

  /**
   * Wrapper publico de fetchPaymentStatus para a reconciliacao server-side de pagamentos
   * (PlanService.reconcileApprovedPayment, endpoint admin de replay e cron reconcile-payments).
   * Mesma garantia de seguranca: retorna null em qualquer falha; o chamador so ativa plano com
   * status 'approved' explicito.
   */
  async getPaymentDetails(paymentId: string) {
    return this.fetchPaymentStatus(paymentId)
  }

  // ─── searchApprovedPaymentByExternalReference (reconciliacao por subscription) ──

  /**
   * Busca no MP um pagamento APROVADO (live_mode) por external_reference (= subscriptionId).
   * Usado pelo cron reconcile-payments para recuperar uma subscription PENDING cujo webhook se
   * perdeu — sem depender do paymentId (que so chega no webhook). Crucial porque webhooks
   * rejeitados no HMAC sao logados SEM transaction_id, entao um sweep por audit log nao acha
   * candidatos. Retorna o paymentId do primeiro pagamento approved+live, ou null. Falha em
   * qualquer erro retorna null (nunca ativa sem confirmacao explicita).
   */
  async searchApprovedPaymentByExternalReference(externalReference: string): Promise<string | null> {
    const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN
    if (!accessToken || !externalReference) return null

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS)
    try {
      const url =
        `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}` +
        `&sort=date_created&criteria=desc`
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
      if (!response.ok) {
        console.warn(`[MERCADO_PAGO] searchByExternalReference: HTTP ${response.status} para ref ${externalReference}`)
        return null
      }
      const body = (await response.json()) as {
        results?: Array<{ id?: string | number; status?: string; live_mode?: boolean }>
      }
      const approved = (body.results ?? []).find(
        (r) => r.status === 'approved' && r.live_mode !== false,
      )
      return approved?.id != null ? String(approved.id) : null
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      console.warn(`[MERCADO_PAGO] searchByExternalReference falhou para ref ${externalReference}: ${msg}`)
      return null
    } finally {
      clearTimeout(timeout)
    }
  }

  // ─── parseWebhookEvent ────────────────────────────────────────────────────

  async parseWebhookEvent(payload: string): Promise<WebhookEvent> {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>
    } catch {
      throw new Error(`[MERCADO_PAGO] Payload JSON malformado: ${payload.substring(0, 200)}`)
    }

    // Extrair data.id do payload — único campo coberto pelo HMAC além do ts.
    const rawDataId = (parsed.data as Record<string, unknown>)?.id
    const dataId    = typeof rawDataId === 'string' || typeof rawDataId === 'number'
      ? String(rawDataId)
      : ''
    const topic = (parsed as Record<string, string>).type
      ?? (parsed as Record<string, string>).topic
      ?? ''

    // HARDENING (D9+): status, external_reference e amount NÃO são cobertos pelo HMAC —
    // um payload forjado pode conter esses campos alterados com data.id legítimo.
    // Solução: ignorar qualquer valor do payload para esses campos e SEMPRE buscar via
    // GET /v1/payments/{id}, independente de mpStatus já estar presente no payload.
    // Exceção: eventos sem data.id (ex.: merchant_order, subscription) — sem API call.
    let extRef  = ''
    let amount  = 0
    let mpStatus = ''

    if (dataId && topic === 'payment') {
      if (!/^\d+$/.test(dataId)) {
        // data.id fora do formato numérico esperado pelo MP → rejeitar
        throw new Error(`[MERCADO_PAGO] data.id com formato inválido: ${dataId}`)
      }

      const fetched = await this.fetchPaymentStatus(dataId)
      if (!fetched) {
        // Não foi possível resolver o status (token ausente, timeout, HTTP != 2xx).
        // Sinalizar retryable — o provedor reenvia, nunca ativamos sem confirmação.
        throw new GatewayRetryableError(
          `[MERCADO_PAGO] status indeterminado para payment ${dataId}: enriquecimento falhou — retry`
        )
      }

      // Defesa em profundidade: um pagamento em modo TESTE (live_mode=false) jamais pode
      // ativar plano real. O token de produção (APP_USR) só processa live (live_mode=true);
      // qualquer live_mode=false aqui é pagamento de sandbox/teste e deve ser descartado.
      // TERMINAL (não-retryable): um pagamento de teste nunca vira live → não reenviar.
      // Só rejeita quando explicitamente false (campo ausente não bloqueia o fluxo real).
      if (fetched.liveMode === false) {
        throw new Error(`[MERCADO_PAGO] pagamento em modo teste (live_mode=false) ignorado: ${dataId}`)
      }

      // FIX-14: live_mode undefined (MP não retornou o campo) ainda ativa o plano
      // pela regra acima (campo ausente não bloqueia). Antes isso era silencioso —
      // agora emite WARN observável para que a degradação (não foi possível
      // confirmar que o pagamento é live) apareça em logs/Sentry. NÃO altera o
      // fluxo: continuamos processando, apenas tornamos a incerteza visível.
      if (fetched.liveMode === undefined) {
        emitDegradationSignal('mercadopago.live_mode_undefined', {
          level: 'warn',
          context: { paymentId: dataId, status: fetched.status ?? '' },
        })
      }

      mpStatus = fetched.status ?? ''
      extRef   = fetched.externalReference ?? ''
      amount   = fetched.amount ? Math.round(fetched.amount * 100) : 0
    }

    if (!extRef) {
      throw new Error('[MERCADO_PAGO] subscriptionId (external_reference) ausente no evento')
    }

    // Mapear status para eventType
    let eventType: WebhookEvent['eventType']

    // Só 'approved' confirma pagamento. O bug anterior usava
    // `approved || action === 'payment.created' && type === 'payment'`, que por
    // precedência de operador (&& antes de ||) confirmava qualquer payment.created
    // — inclusive PIX/cartão ainda não pago — ativando plano sem aprovação.
    if (mpStatus === 'approved') {
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

  // ─── refundPayment ─────────────────────────────────────────────────────────

  /**
   * Estorna um pagamento no MercadoPago via POST /v1/payments/{id}/refunds.
   *
   * - Estorno total: body vazio. Estorno parcial: { amount } em REAIS (não centavos).
   * - Idempotência via header X-Idempotency-Key (refund-{paymentId}) — reenvios não
   *   geram estorno duplicado.
   * - Pagamento já totalmente estornado: MP retorna 4xx; tratamos como alreadyRefunded
   *   (operação idempotente bem-sucedida, não erro).
   * - Timeout / 5xx: GatewayRetryableError — o chamador NÃO deve rebaixar o plano sem
   *   confirmar o estorno.
   *
   * @param gatewayTransactionId paymentId do MP (Payment.gatewayTransactionId)
   * @param amountCents opcional, estorno parcial em centavos
   */
  async refundPayment(gatewayTransactionId: string, amountCents?: number): Promise<RefundResult> {
    const accessToken = env.MERCADO_PAGO_ACCESS_TOKEN
    if (!accessToken) {
      throw new GatewayError('[PAYMENT_010] MERCADO_PAGO_ACCESS_TOKEN não configurado', 'PAYMENT_010', 500)
    }
    if (!/^\d+$/.test(gatewayTransactionId)) {
      throw new GatewayError(`[MERCADO_PAGO] paymentId inválido para refund: ${gatewayTransactionId}`, 'PAYMENT_055', 422)
    }

    let body = '{}'
    let idempotencyKey = `refund-${gatewayTransactionId}`
    if (amountCents !== undefined) {
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
        throw new GatewayError('[MERCADO_PAGO] valor de estorno inválido', 'PAYMENT_020', 422)
      }
      const roundedAmountCents = Math.round(amountCents)
      body = JSON.stringify({ amount: Number((roundedAmountCents / 100).toFixed(2)) })
      idempotencyKey = `refund-${gatewayTransactionId}-partial-${roundedAmountCents}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(gatewayTransactionId)}/refunds`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          // Idempotência: reenvio com mesma chave não duplica estorno
          'X-Idempotency-Key': idempotencyKey,
        },
        body,
        signal: controller.signal,
      })
    } catch (err) {
      // Timeout / rede: transitório — sinaliza retry, nunca rebaixa plano sem estornar
      const msg = err instanceof Error ? err.message : 'erro desconhecido'
      throw new GatewayRetryableError(`[MERCADO_PAGO] refund falhou (transitório) para ${gatewayTransactionId}: ${msg}`)
    } finally {
      clearTimeout(timeout)
    }

    if (response.ok) {
      const json = await response.json().catch(() => ({})) as { id?: string | number; status?: string }
      return {
        refundId: json.id != null ? String(json.id) : 'unknown',
        status: json.status ?? 'approved',
        alreadyRefunded: false,
      }
    }

    // 5xx → transitório (retry). 4xx → terminal.
    const rawError = await response.text().catch(() => '')
    if (response.status >= 500) {
      throw new GatewayRetryableError(
        `[MERCADO_PAGO] refund HTTP ${response.status} (transitório) para ${gatewayTransactionId}: ${rawError.slice(0, 200)}`
      )
    }

    // 4xx: só tratamos como sucesso idempotente quando a mensagem afirmar que o pagamento
    // ja estava estornado. 404/"not allowed" podem significar "não estornou dinheiro".
    const lower = rawError.toLowerCase()
    if (
      lower.includes('already refunded') ||
      lower.includes('already been refunded') ||
      lower.includes('payment already refunded')
    ) {
      console.warn(`[MERCADO_PAGO] refund idempotente/terminal para ${gatewayTransactionId}: HTTP ${response.status} ${rawError.slice(0, 160)}`)
      return { refundId: 'already_refunded', status: 'approved', alreadyRefunded: true }
    }

    throw new GatewayError(
      `[MERCADO_PAGO] refund rejeitado HTTP ${response.status} para ${gatewayTransactionId}: ${rawError.slice(0, 200)}`,
      'PAYMENT_056',
      422
    )
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
