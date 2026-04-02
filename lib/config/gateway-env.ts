// ============================================================================
// Foot Stock — Validação de variáveis de ambiente dos gateways de pagamento
// Falha rápido no startup se variáveis obrigatórias estiverem ausentes
// NUNCA exponha estas variáveis ao cliente (sem NEXT_PUBLIC_)
// ============================================================================

import { z } from 'zod'

// Schema de validação por gateway
export const gatewayEnvSchema = z.object({
  // ─── Mercado Pago ─────────────────────────────────────────────────────────
  // NUNCA exponha MP_ACCESS_TOKEN no cliente
  MP_ACCESS_TOKEN:    z.string().min(10, 'MP_ACCESS_TOKEN deve ter ao menos 10 caracteres'),
  MP_WEBHOOK_SECRET:  z.string().min(20, 'MP_WEBHOOK_SECRET deve ter ao menos 20 caracteres'),
  // MP_PUBLIC_KEY é usada no cliente (NEXT_PUBLIC_ legítimo)
  NEXT_PUBLIC_MP_PUBLIC_KEY: z.string().min(10).optional(),

  // ─── PagSeguro ────────────────────────────────────────────────────────────
  PAGSEGURO_TOKEN:          z.string().min(1, 'PAGSEGURO_TOKEN é obrigatório'),
  PAGSEGURO_WEBHOOK_SECRET: z.string().min(20, 'PAGSEGURO_WEBHOOK_SECRET deve ter ao menos 20 caracteres'),
  PAGSEGURO_SANDBOX:        z.string().optional().default('true'),

  // ─── PayPal ───────────────────────────────────────────────────────────────
  PAYPAL_CLIENT_ID:     z.string().min(1, 'PAYPAL_CLIENT_ID é obrigatório'),
  PAYPAL_CLIENT_SECRET: z.string().min(1, 'PAYPAL_CLIENT_SECRET é obrigatório'),
  PAYPAL_WEBHOOK_ID:    z.string().min(1, 'PAYPAL_WEBHOOK_ID é obrigatório'),
  PAYPAL_SANDBOX:       z.string().optional().default('true'),

  // ─── Gateway ativo ────────────────────────────────────────────────────────
  ACTIVE_GATEWAY: z.enum(['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL']).default('MERCADO_PAGO'),
})

export type GatewayEnv = z.infer<typeof gatewayEnvSchema>

/**
 * Valida variáveis de ambiente dos gateways.
 * @throws ZodError se alguma variável obrigatória estiver ausente (PAYMENT_010)
 */
export function validateGatewayEnv(): GatewayEnv {
  const result = gatewayEnvSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ')
    const err = new Error(
      `[PAYMENT_010] Configuração de gateway ausente. Variáveis faltando: ${missing}`
    ) as Error & { code: string; statusCode: number }
    err.code = 'PAYMENT_010'
    err.statusCode = 500
    throw err
  }
  return result.data
}

/** Variáveis validadas de gateway (lazy — só carrega quando necessário) */
let _gatewayEnv: GatewayEnv | null = null

export function getGatewayEnv(): GatewayEnv {
  if (!_gatewayEnv) {
    _gatewayEnv = validateGatewayEnv()
  }
  return _gatewayEnv
}
