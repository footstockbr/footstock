// ============================================================================
// FootStock — Constantes de segurança PCI-DSS para gateways de pagamento
// NUNCA expor ou armazenar os campos FORBIDDEN_FIELDS
// ============================================================================

/** Campos proibidos por PCI-DSS — JAMAIS armazenar no banco */
export const FORBIDDEN_PAYMENT_FIELDS = [
  'cardNumber',
  'cvv',
  'cvc',
  'cvc2',
  'cvv2',
  'expiryDate',
  'expirationDate',
  'cardHolder',
  'pan',
  'trackData',
  'magneticStripe',
] as const

/** Campos permitidos no model Payment (PCI-DSS compliant) */
export const ALLOWED_PAYMENT_FIELDS = [
  'id',
  'userId',
  'subscriptionId',
  'amount',
  'gateway',
  'gatewayTransactionId',
  'gatewayMeta',
  'status',
  'createdAt',
] as const

/** Rate limit máximo para endpoint de webhook */
export const WEBHOOK_RATE_LIMIT = 100 // req/min por IP

/** Janela de replay attack em milissegundos (5 minutos) */
export const WEBHOOK_REPLAY_WINDOW_MS = 5 * 60 * 1000

/** Timeout máximo para chamadas ao gateway externo */
export const GATEWAY_TIMEOUT_MS = 5_000

/** Expiração de preferência de checkout (Mercado Pago) */
export const CHECKOUT_EXPIRY_MINUTES = 30

/** Máximo de tentativas de dunning */
export const DUNNING_MAX_ATTEMPTS = 3

/** Dias de retenção de logs de auditoria de webhook */
export const WEBHOOK_AUDIT_RETENTION_DAYS = 90
