import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { created, error, errors } from '@/lib/api'
import { planService } from '@/lib/services/PlanService'
import { getCheckoutRateLimit } from '@/lib/ratelimit'

const CheckoutSchema = z.object({
  planType: z.enum(['CRAQUE', 'LENDA']),
  gateway: z.enum(['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL']),
  period: z.enum(['MONTHLY', 'YEARLY']),
})

// POST /api/v1/payments/checkout
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const rl = await getCheckoutRateLimit().limit(auth.user.id)
  if (!rl.success) return errors.rateLimit('Muitas tentativas de checkout. Aguarde alguns minutos.')

  try {
    const body = await request.json()
    const parsed = CheckoutSchema.safeParse(body)
    if (!parsed.success) return errors.validation()

    const { planType, gateway, period } = parsed.data

    const result = await planService.createCheckout(auth.user.id, {
      planType: planType as 'CRAQUE' | 'LENDA',
      gateway,
      period: period.toLowerCase() as 'monthly' | 'yearly',
      userEmail: auth.user.email,
    })

    return created({
      redirectUrl: result.redirectUrl,
      subscriptionId: result.subscriptionId,
    })
  } catch (err: unknown) {
    const e = err as { code?: string; statusCode?: number; message?: string }
    if (e?.statusCode && e?.code) {
      return error(e.code, e.message ?? 'Erro no checkout.', e.statusCode)
    }
    return errors.server()
  }
}
