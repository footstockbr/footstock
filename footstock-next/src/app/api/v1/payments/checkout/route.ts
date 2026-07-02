import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { created, error, errors } from '@/lib/api'
import { planService } from '@/lib/services/PlanService'
import { getCheckoutRateLimit } from '@/lib/ratelimit'
import { isRecurringCapableGateway } from '@/lib/payments/enabled-gateways.server'

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

    // Hardening server-side do gate de checkout: só aceitar gateways CAPAZES de recorrência real.
    // Planos são produtos recorrentes; um gateway que só faz pagamento único (PayPal/PagSeguro,
    // createSubscription não implementado) burlaria o gate da UI via POST direto e cobraria uma
    // vez por uma assinatura. Checagem de CAPACIDADE (env-independente) — credenciais/oferta são
    // validadas downstream (createCheckout). Fecha o bypass do gate no boundary do servidor.
    if (!isRecurringCapableGateway(gateway)) {
      return error('PAYMENT_GATEWAY_NOT_OFFERED', 'Forma de pagamento indisponível para assinatura.', 422)
    }

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
