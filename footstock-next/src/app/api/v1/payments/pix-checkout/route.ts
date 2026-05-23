// ============================================================================
// FootStock — POST /api/v1/payments/pix-checkout
// Cria QR Code Pix via Mercado Pago (ou PagSeguro com sandbox Pix)
// Aviso obrigatório: Pix não é recorrente — renovação manual a cada ciclo
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { planService } from '@/lib/services/PlanService'
import { env } from '@/lib/env'
import { z } from 'zod'

const PixCheckoutSchema = z.object({
  planType: z.enum(['CRAQUE', 'LENDA']),
  period:   z.enum(['monthly', 'yearly']),
})

export const POST = withAuth(async (req: NextRequest, { user }: AuthContext) => {
  if (user.adminRole) {
    return NextResponse.json(
      {
        error: 'AUTH-009',
        message: 'Contas administrativas não podem contratar assinatura.',
      },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = PixCheckoutSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_001', message: 'planType e period são obrigatórios' },
      { status: 400 }
    )
  }

  const { planType, period } = parsed.data
  const userId = user.id

  // Calcular amount
  const { calcSubscriptionAmount } = await import('@/lib/services/plan-logic')
  const amount = calcSubscriptionAmount(planType, period)

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  if (!userRecord) {
    return NextResponse.json({ error: 'USER_NOT_FOUND' }, { status: 404 })
  }

  // Criar subscription PENDING
  const { subscriptionId } = await planService.createCheckout(userId, {
    planType,
    period,
    gateway: 'MERCADO_PAGO', // Pix via MP
    amount,
  })

  // Obter QR Code Pix via MP API
  // Nota: em sandbox MP, o Pix QR é gerado via /v1/payments com payment_method_id=pix
  const appUrl = env.NEXT_PUBLIC_APP_URL
  const mpToken = env.MERCADO_PAGO_ACCESS_TOKEN

  if (!mpToken) {
    return NextResponse.json(
      { error: 'PAYMENT_010', message: 'Gateway não configurado' },
      { status: 500 }
    )
  }

  try {
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': subscriptionId,
      },
      body: JSON.stringify({
        transaction_amount: amount / 100,
        payment_method_id:  'pix',
        payer:              { email: userRecord.email },
        external_reference: subscriptionId,
        description:        `FootStock - Plano ${planType}`,
        notification_url:   `${appUrl}/api/v1/payments/webhook`,
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!mpRes.ok) {
      throw new Error(`MP API retornou ${mpRes.status}`)
    }

    const mpData = await mpRes.json() as {
      id: number
      point_of_interaction: {
        transaction_data: {
          qr_code:          string
          qr_code_base64:   string
        }
      }
    }

    const { qr_code, qr_code_base64 } = mpData.point_of_interaction.transaction_data
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

    return NextResponse.json({
      subscriptionId,
      pixCode:        qr_code,
      qrCodeImageUrl: `data:image/png;base64,${qr_code_base64}`,
      expiresAt,
      // Aviso obrigatório — Pix não é recorrente
      nonRecurrenceWarning: 'Pix não é cobrado automaticamente. Renove manualmente a cada ciclo.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar QR Code Pix'
    return NextResponse.json(
      { error: 'PAYMENT_050', message: msg },
      { status: 503 }
    )
  }
})
