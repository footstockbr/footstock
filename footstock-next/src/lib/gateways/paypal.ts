// ============================================================================
// FootStock — PayPalGateway: redirect checkout + Verify API webhook
// PCI-DSS: dados de cartão NUNCA passam por este gateway — redirect apenas
// Referência: PAYMENT_020 (amount inválido), PAYMENT_050 (gateway indisponível),
//             PAYMENT_051 (URL inválida), PAYMENT_053 (credenciais inválidas)
// ============================================================================

import type { IGateway, GatewayCheckoutInput, GatewayCheckoutResult, GatewaySubscriptionInput, GatewaySubscriptionResult, WebhookEvent } from './IGateway'
import { GatewayRetryableError } from './IGateway'
import type { PlanType } from '@/lib/enums'
import { GATEWAY_TIMEOUT_MS } from '@/lib/constants/payment-security'
import { env } from '@/lib/env'

// ─── Resolução de billing plan IDs (PayPal Subscriptions) ─────────────────────
// PayPal, ao contrário do MP planless, EXIGE um plan_id (criado a partir de um
// catalog product + billing plan). O mapa vem de PAYPAL_PLAN_IDS (JSON) por
// `{PLANO}_{periodo}`. O PREÇO de cada billing plan no PayPal DEVE bater com
// PLAN_AMOUNTS_CENTS — o webhook compara amount e rejeita divergência.
function resolvePaypalPlanId(planType: PlanType, period: 'monthly' | 'yearly'): string | null {
  const raw = env.PAYPAL_PLAN_IDS
  if (!raw || raw.trim() === '') return null
  let map: Record<string, unknown>
  try {
    map = JSON.parse(raw) as Record<string, unknown>
  } catch {
    console.error('[PAYPAL] PAYPAL_PLAN_IDS não é um JSON válido — assinatura recorrente indisponível')
    return null
  }
  const key = `${planType}_${period}`
  const value = map[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

// Event types do webhook que pertencem ao fluxo de ASSINATURA recorrente (Billing
// Subscriptions), distintos do one-time (checkout orders, que usa PAYMENT.CAPTURE.*).
const SUBSCRIPTION_EVENT_TYPES = new Set<string>([
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'PAYMENT.SALE.COMPLETED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
])
// NOTA: BILLING.SUBSCRIPTION.SUSPENDED NÃO é acionado de propósito. cancelAutoRenewal usa
// /suspend (pausa reversível para o CANCELLATION_LOCK), então um SUSPENDED é ESPERADO e não
// deve virar dunning. Falha de cobrança real chega por BILLING.SUBSCRIPTION.PAYMENT.FAILED.

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

    // ── Eventos de ASSINATURA recorrente (Billing Subscriptions) ────────────────
    // ATIVAÇÃO (1ª cobrança) -> PAYMENT_CONFIRMED (o handler chama upgradeUser, que define
    //   User.planType — a fonte que gateia as features). Ciclos seguintes (PAYMENT.SALE.COMPLETED)
    //   -> SUBSCRIPTION_RENEWED (estende vigência, sem re-setar planType). Cancelada/expirada ->
    //   SUBSCRIPTION_CANCELLED. Suspensa/falha de cobrança -> SUBSCRIPTION_PAYMENT_FAILED.
    // INV-3: enriquecimento indeterminado -> GatewayRetryableError (route responde 5xx e o PayPal
    //   reentrega), NUNCA 200 silencioso que perderia o ciclo.
    if (SUBSCRIPTION_EVENT_TYPES.has(eventType)) {
      const eventId = (parsed.id as string) ?? '' // id do webhook event (único por evento, estável em reentrega)
      return this.parseSubscriptionEvent(eventType, resource, payload, eventId)
    }

    // ── one-time (checkout orders): comportamento existente ─────────────────────
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
    // payload nao pode inflar/forjar o valor cobrado.
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

  // ─── parseWebhookEvent: ramo de ASSINATURA (Billing Subscriptions) ───────────
  //
  // NOTA (validar em sandbox): PayPal emite BILLING.SUBSCRIPTION.ACTIVATED E
  // PAYMENT.SALE.COMPLETED para o 1º ciclo. ACTIVATED ativa o plano (PAYMENT_CONFIRMED);
  // a 1ª SALE cairia como SUBSCRIPTION_RENEWED e estenderia a vigência de novo (a Subscription
  // já nasce com expiresAt=now+período). Resolver no sandbox — provável fix: criar Subscription
  // recorrente com expiresAt=now (a 1ª SALE então define o 1º período). Ver checklist da task.
  private async parseSubscriptionEvent(
    eventType: string,
    resource: Record<string, unknown>,
    payload: string,
    eventId: string,
  ): Promise<WebhookEvent> {
    const resourceId = (resource.id as string) ?? ''        // I-xxx (subscription) ou sale id
    const customId   = (resource.custom_id as string) ?? '' // subscriptionId INTERNO (set em createSubscription)

    if (eventType === 'PAYMENT.SALE.COMPLETED') {
      // Ciclo recorrente: a sale carrega billing_agreement_id (= gatewaySubscriptionId I-xxx),
      // mas nem sempre o subscriptionId interno. Enriquecemos via GET da assinatura para resolver
      // o custom_id (interno) — mesmo padrão do enrich do MP. O route casa event.subscriptionId
      // com Subscription.id (interno).
      const agreementId = (resource.billing_agreement_id as string) ?? ''
      if (!agreementId) {
        throw new Error('[PAYPAL] PAYMENT.SALE.COMPLETED sem billing_agreement_id — não é ciclo de assinatura')
      }
      const internalId = customId || (await this.resolveSubscriptionCustomId(agreementId))
      if (!internalId) {
        throw new GatewayRetryableError(`[PAYPAL] custom_id indeterminado para assinatura ${agreementId} — retry`)
      }
      const total = (resource.amount as { total?: string } | undefined)?.total
      const amountCents = total ? Math.round(parseFloat(total) * 100) : 0
      return {
        eventType:      'SUBSCRIPTION_RENEWED',
        transactionId:  resourceId, // sale id — único por ciclo (dedup INV-2)
        subscriptionId: internalId,
        amount:         amountCents,
        gateway:        'PAYPAL',
        rawPayload:     payload,
      }
    }

    // BILLING.SUBSCRIPTION.* — resource.custom_id carrega o subscriptionId interno.
    if (!customId) {
      throw new Error(`[PAYPAL] ${eventType}: custom_id (subscriptionId interno) ausente`)
    }

    let mapped: WebhookEvent['eventType']
    let transactionId: string
    let amountCents = 0

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const lastPayment = (resource.billing_info as { last_payment?: { amount?: { value?: string } } } | undefined)?.last_payment
        amountCents = lastPayment?.amount?.value ? Math.round(parseFloat(lastPayment.amount.value) * 100) : 0
        // O route valida amountMatch(event.amount, subscription.amount) e rejeita divergência de
        // forma TERMINAL. Se o payload de ACTIVATED não trouxe last_payment (campo opcional/
        // timing-dependent), enriquecer via GET antes de aceitar 0 (que seria rejeitado, deixando
        // o usuário pago e SEM acesso). Ainda indeterminado -> retryable (PayPal reentrega).
        if (amountCents === 0) {
          amountCents = await this.resolveSubscriptionLastPaymentCents(resourceId)
        }
        if (amountCents === 0) {
          throw new GatewayRetryableError(`[PAYPAL] ACTIVATED sem valor de cobrança determinável para ${customId} — retry`)
        }
        // marcador estável de ativação por assinatura -> ativa 1x (dedup INV-2)
        transactionId = `paypal-activation-${resourceId || customId}`
        mapped = 'PAYMENT_CONFIRMED'
        break
      }
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
        transactionId = `paypal-subcancel-${resourceId || customId}`
        mapped = 'SUBSCRIPTION_CANCELLED'
        break
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
        // id do WEBHOOK EVENT (único por falha, estável em reentrega) — cada ciclo falho é
        // processado e observável; se usasse o id da assinatura (constante), só a 1ª falha
        // passaria e as seguintes cairiam como DUPLICATE (perda de dunning/observabilidade).
        transactionId = `paypal-subfail-${eventId || resourceId}`
        mapped = 'SUBSCRIPTION_PAYMENT_FAILED'
        break
      default:
        throw new Error(`[PAYPAL] evento de assinatura não mapeado: ${eventType}`)
    }

    return {
      eventType:      mapped,
      transactionId,
      subscriptionId: customId,
      amount:         amountCents,
      gateway:        'PAYPAL',
      rawPayload:     payload,
    }
  }

  /** GET billing_info.last_payment.amount.value da assinatura -> centavos. 0 se indeterminado. */
  private async resolveSubscriptionLastPaymentCents(gatewaySubscriptionId: string): Promise<number> {
    if (!gatewaySubscriptionId) return 0
    try {
      const accessToken = await this.getAccessToken()
      const res = await fetch(`${this.apiBase}/v1/billing/subscriptions/${gatewaySubscriptionId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      })
      if (!res.ok) return 0
      const data = await res.json().catch(() => ({})) as { billing_info?: { last_payment?: { amount?: { value?: string } } } }
      const value = data.billing_info?.last_payment?.amount?.value
      return value ? Math.round(parseFloat(value) * 100) : 0
    } catch {
      return 0
    }
  }

  /** GET /v1/billing/subscriptions/{id} -> custom_id (subscriptionId interno). '' se indeterminado. */
  private async resolveSubscriptionCustomId(gatewaySubscriptionId: string): Promise<string> {
    try {
      const accessToken = await this.getAccessToken()
      const res = await fetch(`${this.apiBase}/v1/billing/subscriptions/${gatewaySubscriptionId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      })
      if (!res.ok) return ''
      const data = await res.json().catch(() => ({})) as { custom_id?: string }
      return data.custom_id ?? ''
    } catch {
      return ''
    }
  }

  // ─── createSubscription (assinatura recorrente real — Billing Subscriptions) ──
  //
  // Cria uma assinatura recorrente no PayPal via POST /v1/billing/subscriptions com um
  // billing plan_id (resolvido de PAYPAL_PLAN_IDS). PCI-DSS: NUNCA transmite dados de cartão —
  // o PayPal coleta no fluxo de aprovação (redirect `approve`). `custom_id` = subscriptionId
  // interno, que volta nos webhooks (resource.custom_id) para casar o evento à Subscription.
  // Idempotência: header PayPal-Request-Id derivado do subscriptionId — um retry não cria 2ª
  // assinatura. Erros: 4xx terminal -> GatewayError 422 (não retentar); 5xx/rede -> GatewayRetryableError.
  //
  // HIPÓTESES a validar em SANDBOX antes de habilitar (ver checklist na task):
  //  - suporte a BRL em assinatura PayPal para a conta (PayPal BR pode exigir USD);
  //  - o preço do billing plan casa com PLAN_AMOUNTS_CENTS (o webhook rejeita divergência);
  //  - semântica dos eventos de ativação/renovação (ver parseWebhookEvent).
  async createSubscription(input: GatewaySubscriptionInput): Promise<GatewaySubscriptionResult> {
    if (!input.amount || input.amount <= 0) {
      throw new GatewayError('Valor de assinatura inválido', 'PAYMENT_020', 422)
    }
    if (!input.successUrl || !input.failureUrl) {
      throw new GatewayError('URL de redirecionamento inválida', 'PAYMENT_051', 422)
    }
    if (!input.userEmail) {
      throw new GatewayError('payer_email ausente para assinatura recorrente', 'PAYMENT_059', 422)
    }

    const planId = resolvePaypalPlanId(input.planType, input.period)
    if (!planId) {
      throw new GatewayError(
        `[PAYPAL] billing plan não configurado para ${input.planType}/${input.period} (defina PAYPAL_PLAN_IDS)`,
        'PAYMENT_010',
        500,
      )
    }

    try {
      const accessToken = await this.getAccessToken()

      const res = await fetch(`${this.apiBase}/v1/billing/subscriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          // Idempotência do PayPal: mesma request-id => mesma assinatura (não duplica).
          'PayPal-Request-Id': `subscription-${input.subscriptionId}`,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          plan_id:   planId,
          custom_id: input.subscriptionId, // reference interno — volta como resource.custom_id nos webhooks
          subscriber: { email_address: input.userEmail },
          application_context: {
            brand_name:          'FootStock',
            locale:              'pt-BR',
            shipping_preference: 'NO_SHIPPING',
            user_action:         'SUBSCRIBE_NOW',
            payment_method: {
              payer_selected:  'PAYPAL',
              payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED',
            },
            return_url: input.successUrl,
            cancel_url: input.failureUrl,
          },
        }),
        signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 401) {
          throw new GatewayError('Credenciais PayPal inválidas', 'PAYMENT_053', 401)
        }
        // 5xx/rede: transitório -> o chamador NÃO marca recurring sem confirmação.
        if (res.status >= 500) {
          throw new GatewayRetryableError(`[PAYPAL] subscriptions ${res.status}: ${body.substring(0, 200)}`)
        }
        // 4xx terminal (config/validação): não retentar.
        throw new GatewayError(`[PAYPAL] subscriptions rejeitado HTTP ${res.status}: ${body.substring(0, 200)}`, 'PAYMENT_059', 422)
      }

      const sub = await res.json() as {
        id?: string
        status?: string
        links?: Array<{ rel: string; href: string }>
      }

      const approveLink = sub.links?.find((l) => l.rel === 'approve')?.href
      if (!sub.id || !approveLink) {
        throw new GatewayError('[PAYPAL] resposta de subscription sem id/approve link', 'PAYMENT_050', 503)
      }

      return {
        redirectUrl:           approveLink,
        gatewaySubscriptionId: sub.id,
        gatewayPlanId:         planId,
        status:                sub.status ?? 'APPROVAL_PENDING',
      }
    } catch (err) {
      if (err instanceof GatewayError || err instanceof GatewayRetryableError) throw err
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      throw new GatewayError(`Gateway PayPal indisponível: ${msg}`, 'PAYMENT_050', 503)
    }
  }

  // ─── cancel / reactivate auto-renewal (Billing Subscriptions) ─────────────────

  async cancelAutoRenewal(gatewaySubscriptionId: string): Promise<void> {
    if (!gatewaySubscriptionId) return
    // Usa /suspend (pausa REVERSÍVEL), NÃO /cancel (terminal): cancelAutoRenewal é chamado no
    // CANCELLATION_LOCK (janela reversível), e reactivateAutoRenewal precisa poder restaurar a
    // MESMA assinatura via /activate — o que só funciona a partir de SUSPENDED. Espelha o
    // 'paused' do Mercado Pago (uma assinatura CANCELLED no PayPal é irreversível).
    const accessToken = await this.getAccessToken()
    const res = await fetch(`${this.apiBase}/v1/billing/subscriptions/${gatewaySubscriptionId}/suspend`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Pausa de auto-renovação (FootStock)' }),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    })
    // 204 = suspenso; 422 (já suspenso/estado incompatível para suspender) é idempotente aqui.
    if (!res.ok && res.status !== 422) {
      const body = await res.text().catch(() => '')
      throw new GatewayError(`[PAYPAL] suspend HTTP ${res.status}: ${body.substring(0, 160)}`, 'PAYMENT_050', 503)
    }
  }

  async reactivateAutoRenewal(gatewaySubscriptionId: string): Promise<void> {
    if (!gatewaySubscriptionId) return
    const accessToken = await this.getAccessToken()
    const res = await fetch(`${this.apiBase}/v1/billing/subscriptions/${gatewaySubscriptionId}/activate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Reativação (FootStock)' }),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    })
    // /activate só reativa uma assinatura SUSPENDED. Um 422 aqui significa que a assinatura NÃO
    // está reativável (ex.: CANCELLED/EXPIRED) — a reativação FALHOU. NUNCA tratar como sucesso
    // silencioso (Zero Silêncio): mascarar deixaria o estado local ACTIVE sem renovação real.
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new GatewayError(`[PAYPAL] activate HTTP ${res.status}: ${body.substring(0, 160)}`, 'PAYMENT_050', 503)
    }
  }

  async cancelSubscriptionTerminal(gatewaySubscriptionId: string): Promise<void> {
    if (!gatewaySubscriptionId) return
    // Cancelamento TERMINAL (irreversível) via POST /cancel — distinto do /suspend reversível de
    // cancelAutoRenewal. Usado no supersede de checkout abandonado / exclusão de conta.
    const accessToken = await this.getAccessToken()
    const res = await fetch(`${this.apiBase}/v1/billing/subscriptions/${gatewaySubscriptionId}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Checkout abandonado / supersede (FootStock)' }),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    })
    // 204 = cancelada; 404/422 (já cancelada/terminal) são idempotentes -> no-op.
    if (!res.ok && res.status !== 422 && res.status !== 404) {
      const body = await res.text().catch(() => '')
      throw new GatewayError(`[PAYPAL] cancelSubscriptionTerminal HTTP ${res.status}: ${body.substring(0, 160)}`, 'PAYMENT_050', 503)
    }
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
