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
import { captureException } from '@/lib/monitoring/sentry'
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

  // Criar subscription PENDING.
  // FIX-20: createCheckout lanca erros de negocio codificados (ORDER_081 = ja
  // possui o plano ativo; PAYMENT_054 = downgrade invalido a partir do plano
  // atual; AUTH-009 = conta administrativa). Sem este try/catch eles vazariam
  // como 500 cru. Mapeamos cada erro codificado ao seu statusCode declarado para
  // que a UI exiba a mensagem certa (Zero Silencio); erro nao-codificado cai em
  // PAYMENT_050/503 sem expor stack.
  let subscriptionId: string
  try {
    const checkout = await planService.createCheckout(userId, {
      planType,
      period,
      gateway: 'MERCADO_PAGO', // Pix via MP
      userEmail: userRecord.email,
      amount,
      // FU-023-5: caminho Pix usa POST /v1/payments direto (abaixo), nao a preferencia de
      // redirect do gateway. Pular /checkout/preferences evita preference + merchant_order
      // orfaos no MP. So criamos a Subscription PENDING aqui.
      skipGatewayCheckout: true,
    })
    subscriptionId = checkout.subscriptionId
  } catch (err) {
    const code = (err as { code?: unknown }).code
    const statusCode = (err as { statusCode?: unknown }).statusCode
    const message = err instanceof Error ? err.message : 'Falha ao iniciar checkout Pix'
    if (typeof code === 'string' && typeof statusCode === 'number') {
      return NextResponse.json({ error: code, message }, { status: statusCode })
    }
    return NextResponse.json(
      { error: 'PAYMENT_050', message },
      { status: 503 }
    )
  }

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

    // FIX-20: persistir o paymentId do Pix (mpData.id) como Payment PENDING,
    // chaveado por gatewayTransactionId. Isso (a) correlaciona o pagamento quando
    // o webhook chega — `payment.upsert({ where: { gatewayTransactionId } })`
    // encontra esta linha em vez de criar outra — e (b) permite reconciliacao caso
    // o webhook nunca chegue (o cron reconcile-payments consulta o MP pelo
    // paymentId). Idempotente via upsert (re-tentativa do checkout nao quebra).
    const paymentId = String(mpData.id)
    await prisma.payment.upsert({
      where: { gatewayTransactionId: paymentId },
      update: {},
      create: {
        userId,
        subscriptionId,
        amount,
        gateway: 'MERCADO_PAGO',
        gatewayTransactionId: paymentId,
        status: 'PENDING',
      },
    })

    const { qr_code, qr_code_base64 } = mpData.point_of_interaction.transaction_data
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()

    return NextResponse.json({
      subscriptionId,
      pixCode:        qr_code,
      qrCodeImageUrl: `data:image/png;base64,${qr_code_base64}`,
      expiresAt,
      // SSoT (FIX-12): valor cobrado em centavos — a UI deriva o preco exibido
      // deste campo, garantindo "preco exibido == amountCents/100 cobrado".
      amountCents:    amount,
      // Aviso obrigatório — Pix não é recorrente
      nonRecurrenceWarning: 'Pix não é cobrado automaticamente. Renove manualmente a cada ciclo.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao gerar QR Code Pix'
    // FU-023-1 (Zero Silencio): erros nao-codificados ao gerar o QR Code Pix (timeout/rede do MP,
    // resposta inesperada, falha do payment.upsert) caem aqui e viram 503 ao cliente. Sem sinal
    // observavel a falha desaparece em silencio. Emitimos Sentry + log estruturado ANTES do
    // retorno, usando o mesmo wrapper de observabilidade do repo (lib/monitoring/sentry).
    captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { area: 'pix_checkout', signal: 'ALERT' },
      userId,
      planType,
      period,
      subscriptionId,
    })
    console.error(
      `[pix-checkout][ALERT] Falha ao gerar QR Code Pix (retornando 503). ` +
        `userId=${userId} planType=${planType} period=${period} subscriptionId=${subscriptionId}`,
      err
    )
    return NextResponse.json(
      { error: 'PAYMENT_050', message: msg },
      { status: 503 }
    )
  }
})
