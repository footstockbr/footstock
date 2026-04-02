// ============================================================================
// Foot Stock — POST /api/v1/payments/checkout
// Inicia fluxo de checkout com rate limiting e mapeamento de erros
// PCI-DSS: dados de cartão NUNCA passam por este endpoint
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { planService } from '@/lib/services/PlanService'
import { isPaymentError } from '@/lib/errors/payment-errors'
import { redisPublisher as redis } from '@/lib/redis'

const VALID_GATEWAYS = ['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL'] as const
const VALID_PLANS = ['CRAQUE', 'LENDA'] as const
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW = 60 // segundos

const CheckoutSchema = z.object({
  planType: z.enum(VALID_PLANS, {
    errorMap: () => ({ message: 'Plano inválido. Escolha CRAQUE ou LENDA.' }),
  }),
  period: z.enum(['monthly', 'yearly'], {
    errorMap: () => ({ message: "Período inválido. Use 'monthly' ou 'yearly'." }),
  }),
  gateway: z.enum(VALID_GATEWAYS, {
    errorMap: () => ({
      message: 'Gateway de pagamento inválido. Escolha entre Mercado Pago, PagSeguro ou PayPal.',
    }),
  }),
})

async function checkRateLimit(userId: string): Promise<{ limited: boolean; retryAfter: number }> {
  const key = `ratelimit:checkout:${userId}`
  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, RATE_LIMIT_WINDOW)
    if (count > RATE_LIMIT_MAX) {
      const ttl = await redis.ttl(key)
      return { limited: true, retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW }
    }
  } catch {
    // Redis indisponível — permitir request (fail open)
  }
  return { limited: false, retryAfter: 0 }
}

async function handler(req: NextRequest, { user }: AuthContext) {
  if (user.adminRole) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'AUTH_009',
          message: 'Contas administrativas não podem contratar assinatura.',
        },
      },
      { status: 403 }
    )
  }

  // Rate limiting por userId
  const { limited, retryAfter } = await checkRateLimit(user.id)
  if (limited) {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_001', message: 'Muitas tentativas. Tente novamente em instantes.', retryAfter } },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  // Parse e validação do body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Body inválido.' } },
      { status: 400 }
    )
  }

  const parsed = CheckoutSchema.safeParse(body)
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]
    const message = firstError?.message ?? 'Dados inválidos.'
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message, fields: parsed.error.errors } },
      { status: 400 }
    )
  }

  const { planType, period, gateway } = parsed.data

  try {
    const result = await planService.createCheckout(user.id, { planType, period, gateway })
    return NextResponse.json({ success: true, data: result }, { status: 200 })
  } catch (err) {
    if (isPaymentError(err)) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.userMessage } },
        { status: err.statusCode }
      )
    }

    // Erros com code customizado (não PaymentError mas com code definido)
    if (err instanceof Error && 'code' in err) {
      const e = err as Error & { code: string; statusCode?: number }
      return NextResponse.json(
        { success: false, error: { code: e.code, message: e.message } },
        { status: e.statusCode ?? 422 }
      )
    }

    console.error('[checkout] Erro interno:', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno. Tente novamente em instantes.' } },
      { status: 500 }
    )
  }
}

export const POST = withAuth(handler as never)
