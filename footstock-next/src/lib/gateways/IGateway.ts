// ============================================================================
// FootStock — IGateway: contrato comum para todos os gateways de pagamento
// PCI-DSS: dados de cartão NUNCA passam por esta interface
// ============================================================================

import type { PlanType } from '@/lib/enums'

// ─── Enum de tipos de gateway ─────────────────────────────────────────────────

export enum GatewayType {
  MERCADO_PAGO = 'MERCADO_PAGO',
  PAGSEGURO    = 'PAGSEGURO',
  PAYPAL       = 'PAYPAL',
}

// ─── Tipos de entrada e saída ─────────────────────────────────────────────────

/** Input para criar checkout — NUNCA inclui dados de cartão */
export interface GatewayCheckoutInput {
  planType:       PlanType
  period:         'monthly' | 'yearly'
  amount:         number          // centavos BRL — NUNCA Float (PCI-DSS)
  currency:       'BRL' | 'USD'
  subscriptionId: string
  userId:         string
  userEmail:      string
  successUrl:     string
  failureUrl:     string
  pendingUrl:     string
}

/** Resultado de criação de checkout */
export interface GatewayCheckoutResult {
  redirectUrl:   string
  transactionId: string
  expiresAt?:    string
}

/**
 * Input para criar uma assinatura recorrente (auto-renewal real no gateway).
 * Método NOVO (D1): distinto de createCheckout, que permanece como cobrança one-time (D2).
 * NUNCA inclui dados de cartão — o gateway coleta no fluxo de autorização (redirect).
 */
export interface GatewaySubscriptionInput {
  planType:       PlanType
  period:         'monthly' | 'yearly'
  amount:         number          // centavos — valor de cada ciclo de cobrança (NUNCA Float, PCI-DSS)
  currency:       'BRL' | 'USD'
  subscriptionId: string          // Subscription.id interno (reference do gateway)
  userId:         string
  userEmail:      string
  successUrl:     string
  failureUrl:     string
  pendingUrl:     string
}

/** Resultado de criação de assinatura recorrente */
export interface GatewaySubscriptionResult {
  /** URL de autorização/checkout da assinatura recorrente (redirect) */
  redirectUrl:           string
  /** ID da assinatura recorrente no gateway (Subscription.gatewaySubscriptionId) */
  gatewaySubscriptionId: string
  /**
   * ID do plano/preço recorrente no gateway, quando aplicável (Subscription.gatewayPlanId).
   * `null` no caminho planless (sem plano associado, ex: MercadoPago redirect/pending).
   */
  gatewayPlanId?:        string | null
  /** Status inicial reportado pelo gateway (Subscription.gatewayStatus) */
  status?:               string
}

/** Resultado de uma operação de estorno (refund) */
export interface RefundResult {
  /** ID do estorno no gateway (ou 'already_refunded' quando idempotente) */
  refundId:        string
  /** Status do estorno conforme o gateway (approved/pending/in_process) */
  status:          string
  /** true quando o pagamento já estava estornado (operação idempotente, sem novo estorno) */
  alreadyRefunded: boolean
}

/** Evento normalizado de webhook */
export interface WebhookEvent {
  // One-time (checkout): PAYMENT_CONFIRMED | PAYMENT_FAILED | REFUND_COMPLETED.
  // Ciclo recorrente (assinatura): SUBSCRIPTION_RENEWED (novo ciclo cobrado com sucesso),
  //   SUBSCRIPTION_PAYMENT_FAILED (falha de cobrança no ciclo — dispara dunning),
  //   SUBSCRIPTION_CANCELLED (assinatura recorrente encerrada/cancelada no gateway).
  // O parser de webhook de assinatura (task 007) normaliza para estes tipos.
  eventType:
    | 'PAYMENT_CONFIRMED'
    | 'PAYMENT_FAILED'
    | 'REFUND_COMPLETED'
    | 'SUBSCRIPTION_RENEWED'
    | 'SUBSCRIPTION_PAYMENT_FAILED'
    | 'SUBSCRIPTION_CANCELLED'
  transactionId:  string
  subscriptionId: string
  amount:         number
  gateway:        string
  rawPayload:     string
}

/**
 * Erro de parsing/enriquecimento TRANSITÓRIO: o evento pode ser válido, mas não foi possível
 * determinar seu estado agora (ex.: GET /v1/payments/{id} do Mercado Pago falhou por timeout
 * ou indisponibilidade). O webhook deve responder com status retryable (5xx) para que o
 * provedor reentregue, em vez de 200 (que seria interpretado como "recebido, não reenviar").
 * Distingue-se de um Error comum, que indica payload terminalmente inválido/não mapeável.
 */
export class GatewayRetryableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GatewayRetryableError'
  }
}

// ─── Interface principal ──────────────────────────────────────────────────────

/** Contrato comum para todos os gateways de pagamento */
export interface IGateway {
  name: string

  /**
   * Cria checkout de assinatura e retorna URL de redirect.
   * Cobrança one-time (D2): NÃO configura renovação automática no gateway.
   * NUNCA transmite dados de cartão — redirect checkout apenas.
   */
  createCheckout(input: GatewayCheckoutInput): Promise<GatewayCheckoutResult>

  /**
   * Cria uma assinatura recorrente real (auto-renewal) no gateway e retorna URL de autorização.
   * Método NOVO (D1): distinto de createCheckout. Gateways que ainda não suportam recorrência
   * DEVEM lançar erro explícito (não-implementado), NUNCA retornar undefined nem stub silencioso.
   * NUNCA transmite dados de cartão — redirect/autorização apenas.
   * @throws Error com code de não-implementado (statusCode 501) enquanto a integração recorrente
   *         do gateway não estiver disponível.
   */
  createSubscription(input: GatewaySubscriptionInput): Promise<GatewaySubscriptionResult>

  /**
   * Valida assinatura HMAC do webhook recebido.
   * Deve usar timingSafeEqual para resistir a timing attacks.
   * @returns true se válido, false se inválido (nunca lança exceção por HMAC inválido)
   */
  validateWebhook(payload: string, signature: string, secret: string): boolean

  /**
   * Parseia payload de webhook e normaliza para WebhookEvent.
   * Assíncrono: alguns gateways (ex.: Mercado Pago) recebem notificações que trazem
   * apenas um id de recurso e exigem um GET ao gateway para resolver o status real.
   * @throws Error com mensagem descritiva para payloads malformados ou status não mapeado
   */
  parseWebhookEvent(payload: string): Promise<WebhookEvent>

  /**
   * Cancela a renovação automática de uma assinatura no gateway.
   * Chamado ao entrar em CANCELLATION_LOCK para evitar nova cobrança.
   * @param gatewaySubscriptionId — ID da assinatura recorrente no gateway
   */
  cancelAutoRenewal(gatewaySubscriptionId: string): Promise<void>

  /**
   * Reativa a renovação automática após reversão de CANCELLATION_LOCK.
   * @param gatewaySubscriptionId — ID da assinatura recorrente no gateway
   */
  reactivateAutoRenewal(gatewaySubscriptionId: string): Promise<void>

  /**
   * Estorna (refund) um pagamento no gateway.
   * @param gatewayTransactionId — ID do pagamento no gateway (Payment.gatewayTransactionId)
   * @param amountCents — opcional: estorno parcial em centavos. Omitir = estorno total.
   * @returns RefundResult com o id e status do estorno
   * @throws GatewayRetryableError em falhas transitórias (timeout, 5xx) — chamador deve retentar
   * @throws Error em falhas terminais (pagamento inexistente, gateway não suportado)
   */
  refundPayment(gatewayTransactionId: string, amountCents?: number): Promise<RefundResult>
}
