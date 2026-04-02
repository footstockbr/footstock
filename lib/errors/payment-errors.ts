// ============================================================================
// Foot Stock — Erros de pagamento e assinatura (PAYMENT_ do ERROR-CATALOG)
// ============================================================================

/** Classe base para erros de pagamento */
export class PaymentError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly userMessage: string,
    public readonly technicalMessage?: string
  ) {
    super(userMessage)
    this.name = 'PaymentError'
  }
}

/** Mapa de todos os erros PAYMENT_ conforme ERROR-CATALOG seção 2.8 */
export const PAYMENT_ERRORS = {
  /** Falha na validação do webhook (HMAC ou assinatura) */
  WEBHOOK_VALIDATION_FAILED: {
    code: 'PAYMENT_001',
    status: 401,
    message: '', // silencioso — nunca expor detalhes de validação
  },
  /** Payload de webhook malformado */
  WEBHOOK_INVALID_PAYLOAD: {
    code: 'PAYMENT_002',
    status: 400,
    message: '', // silencioso — não expor ao frontend
  },
  /** Configuração de gateway ausente (variáveis de ambiente) */
  GATEWAY_CONFIG_MISSING: {
    code: 'PAYMENT_010',
    status: 500,
    message: 'Erro interno de configuração do gateway de pagamento.',
  },
  /** Erro na comunicação com o gateway (timeout, rede, resposta inesperada) */
  GATEWAY_ERROR: {
    code: 'PAYMENT_020',
    status: 502,
    message: 'Erro ao comunicar com o gateway de pagamento. Tente novamente.',
  },
  /** Pagamento recusado pelo gateway */
  DECLINED: {
    code: 'PAYMENT_050',
    status: 422,
    message: 'Pagamento não processado. Verifique seus dados ou tente outro gateway de pagamento.',
  },
  /** HMAC inválido — resposta silenciosa, não expor ao frontend */
  INVALID_HMAC: {
    code: 'PAYMENT_051',
    status: 400,
    message: '', // silencioso — nunca expor ao frontend
  },
  /** Webhook duplicado — idempotência */
  DUPLICATE: {
    code: 'PAYMENT_052',
    status: 409,
    message: '', // silencioso — idempotência
  },
  /** Gateway não suportado */
  INVALID_GATEWAY: {
    code: 'PAYMENT_053',
    status: 400,
    message: 'Gateway de pagamento inválido. Escolha entre Mercado Pago, PagSeguro ou PayPal.',
  },
  /** Usuário já tem assinatura ativa do mesmo plano */
  ACTIVE_SUBSCRIPTION: {
    code: 'PAYMENT_054',
    status: 422,
    message:
      'Você já possui uma assinatura ativa. Para trocar de plano, cancele a atual primeiro.',
  },
  /** Rate limit excedido no endpoint de webhook */
  WEBHOOK_RATE_LIMITED: {
    code: 'PAYMENT_055',
    status: 429,
    message: '', // silencioso — rate limit do webhook
  },
  /** Máximo de tentativas de dunning atingido */
  DUNNING_MAX_ATTEMPTS: {
    code: 'PAYMENT_060',
    status: 422,
    message: 'O número máximo de tentativas de cobrança foi atingido.',
  },
  /** Assinatura não encontrada */
  NOT_FOUND: {
    code: 'PAYMENT_080',
    status: 404,
    message: 'Assinatura não encontrada.',
  },
} as const

export type PaymentErrorKey = keyof typeof PAYMENT_ERRORS

/** Lança PaymentError mapeado do PAYMENT_ERRORS */
export function throwPaymentError(key: PaymentErrorKey, technical?: string): never {
  const { code, status, message } = PAYMENT_ERRORS[key]
  throw new PaymentError(code, status, message, technical)
}

/** Type guard para PaymentError */
export function isPaymentError(err: unknown): err is PaymentError {
  return err instanceof PaymentError
}
