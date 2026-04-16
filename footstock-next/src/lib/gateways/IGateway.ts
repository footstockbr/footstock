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

/** Evento normalizado de webhook */
export interface WebhookEvent {
  eventType:      'PAYMENT_CONFIRMED' | 'PAYMENT_FAILED' | 'REFUND_COMPLETED'
  transactionId:  string
  subscriptionId: string
  amount:         number
  gateway:        string
  rawPayload:     string
}

// ─── Interface principal ──────────────────────────────────────────────────────

/** Contrato comum para todos os gateways de pagamento */
export interface IGateway {
  name: string

  /**
   * Cria checkout de assinatura e retorna URL de redirect.
   * NUNCA transmite dados de cartão — redirect checkout apenas.
   */
  createCheckout(input: GatewayCheckoutInput): Promise<GatewayCheckoutResult>

  /**
   * Valida assinatura HMAC do webhook recebido.
   * Deve usar timingSafeEqual para resistir a timing attacks.
   * @returns true se válido, false se inválido (nunca lança exceção por HMAC inválido)
   */
  validateWebhook(payload: string, signature: string, secret: string): boolean

  /**
   * Parseia payload de webhook e normaliza para WebhookEvent.
   * @throws Error com mensagem descritiva para payloads malformados
   */
  parseWebhookEvent(payload: string): WebhookEvent

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
}
