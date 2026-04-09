import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGatewayByHeader, detectGatewayType } from '@/lib/gateways/GatewayFactory'
import { planService } from '@/lib/services/PlanService'
import { webhookAuditService } from '@/lib/services/WebhookAuditService'
import type { SubscriptionGateway } from '@prisma/client'

// POST /api/v1/payments/webhook
// Público — autenticado por HMAC-SHA256 (sem Bearer token)
// Qualquer erro retorna 200 silencioso para não vazar informação de segurança
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined

  // 1. Leitura do raw body — necessário para validação HMAC
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 2. Detectar gateway pelo header
  const gateway = getGatewayByHeader(request.headers)
  const gatewayType = detectGatewayType(request.headers)

  if (!gateway || !gatewayType) {
    // Rejeição silenciosa — não revelar detalhes de segurança ao chamador
    await webhookAuditService.logWebhook({
      gateway: 'MERCADO_PAGO' as SubscriptionGateway, // fallback para log
      status: 'REJECTED',
      hmacValid: false,
      ipAddress: ip,
      errorMessage: 'Gateway não reconhecido nos headers',
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const gatewayEnum = gatewayType as unknown as SubscriptionGateway

  // 3. Validar assinatura HMAC
  let hmacValid: boolean
  try {
    hmacValid = gateway.validateWebhook(rawBody, request.headers)
  } catch {
    hmacValid = false
  }

  if (!hmacValid) {
    await webhookAuditService.logWebhook({
      gateway: gatewayEnum,
      status: 'REJECTED',
      hmacValid: false,
      ipAddress: ip,
      errorMessage: 'HMAC inválido',
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 4. Parse do evento
  let event: Awaited<ReturnType<typeof gateway.parseWebhookEvent>>
  try {
    event = gateway.parseWebhookEvent(rawBody)
  } catch {
    await webhookAuditService.logWebhook({
      gateway: gatewayEnum,
      status: 'REJECTED',
      hmacValid: true,
      ipAddress: ip,
      errorMessage: 'Falha ao parsear evento',
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 5. Idempotência: checar WebhookAuditLog por transactionId
  if (event.transactionId) {
    const duplicate = await prisma.webhookAuditLog.findFirst({
      where: {
        transactionId: event.transactionId,
        status: 'ACCEPTED',
      },
    })
    if (duplicate) {
      return NextResponse.json({ received: true }, { status: 200 })
    }
  }

  // 6. Log do webhook aceito
  await webhookAuditService.logWebhook({
    gateway: gatewayEnum,
    eventType: event.eventType,
    transactionId: event.transactionId,
    subscriptionId: event.subscriptionId,
    status: 'ACCEPTED',
    hmacValid: true,
    ipAddress: ip,
  })

  // 7. Processar evento por tipo
  try {
    if (event.eventType === 'PAYMENT_CONFIRMED') {
      // Buscar subscription para obter userId
      const subscription = await prisma.subscription.findUnique({
        where: { id: event.subscriptionId },
        select: { userId: true, planType: true, period: true, amount: true },
      })

      if (subscription) {
        // Ativar plano do usuário
        await planService.upgradeUser(subscription.userId, event.subscriptionId)

        // Criar registro de Payment (para histórico e idempotência futura)
        await prisma.payment.upsert({
          where: { gatewayTransactionId: event.transactionId },
          update: { status: 'PAID', processedAt: new Date() },
          create: {
            userId: subscription.userId,
            subscriptionId: event.subscriptionId,
            amount: event.amount,
            gateway: gatewayEnum,
            gatewayTransactionId: event.transactionId,
            status: 'PAID',
            processedAt: new Date(),
          },
        })
      }
    } else if (event.eventType === 'PAYMENT_FAILED') {
      // Marcar subscription como PAST_DUE para acionar dunning
      await prisma.subscription.updateMany({
        where: { id: event.subscriptionId, status: { in: ['ACTIVE', 'PENDING'] } },
        data: { status: 'PAST_DUE' },
      })

      await prisma.payment.upsert({
        where: { gatewayTransactionId: event.transactionId },
        update: { status: 'FAILED' },
        create: {
          subscriptionId: event.subscriptionId,
          amount: event.amount,
          gateway: gatewayEnum,
          gatewayTransactionId: event.transactionId,
          status: 'FAILED',
          userId: (await prisma.subscription.findUnique({
            where: { id: event.subscriptionId },
            select: { userId: true },
          }))?.userId ?? '',
        },
      })
    } else if (event.eventType === 'REFUND_COMPLETED') {
      await prisma.subscription.updateMany({
        where: { id: event.subscriptionId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })

      await prisma.payment.upsert({
        where: { gatewayTransactionId: event.transactionId },
        update: { status: 'REFUNDED' },
        create: {
          subscriptionId: event.subscriptionId,
          amount: event.amount,
          gateway: gatewayEnum,
          gatewayTransactionId: event.transactionId,
          status: 'REFUNDED',
          userId: (await prisma.subscription.findUnique({
            where: { id: event.subscriptionId },
            select: { userId: true },
          }))?.userId ?? '',
        },
      })
    }
  } catch (err) {
    console.error('[webhook] Erro ao processar evento:', err)
    // Não retornar erro — já foi logado; reprocessamento via dunning se necessário
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
