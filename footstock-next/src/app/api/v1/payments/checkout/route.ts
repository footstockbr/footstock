import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

const CheckoutSchema = z.object({
  planType: z.enum(['CRAQUE', 'LENDA']),
  gateway: z.enum(['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL']),
  period: z.enum(['MONTHLY', 'ANNUAL']),
})

// POST /api/v1/payments/checkout
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const body = await request.json()
    const parsed = CheckoutSchema.safeParse(body)

    if (!parsed.success) {
      return errors.validation()
    }

    const { planType, gateway, period } = parsed.data

    // Verificar se já tem assinatura ativa no mesmo plano
    const existing = await prisma.subscription.findUnique({
      where: { userId: auth.user.id },
    })

    if (existing && existing.status === 'ACTIVE' && existing.planType === planType) {
      return errors.conflict('PAYMENT_002', 'Você já possui uma assinatura ativa neste plano.')
    }

    // TODO: Implementar via /auto-flow execute
    // Integrar com gateway (Mercado Pago / PagSeguro / PayPal SDK)
    // Criar preferência de pagamento e retornar URL de checkout
    const subscriptionId = crypto.randomUUID()

    return ok({
      checkoutUrl: `https://placeholder-gateway.com/checkout/${subscriptionId}`,
      subscriptionId,
    })
  } catch {
    return errors.server()
  }
}
