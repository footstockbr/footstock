// ============================================================================
// Foot Stock — POST /api/v1/payments/webhook
// Handler unificado de webhooks com validação HMAC, idempotência e auditoria
// PCI-DSS: gatewayMeta NUNCA contém PAN, CVV ou dados sensíveis de cartão
// Referência: PAYMENT_001 (HMAC inválido), PAYMENT_055 (rate limit)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { planService } from '@/lib/services/PlanService'
import { webhookAuditService } from '@/lib/services/WebhookAuditService'
import { webhookRateLimit } from '@/lib/ratelimit'
import { getGatewayByHeader, detectGatewayType } from '@/lib/gateways/GatewayFactory'
import { validateWebhookByGateway } from '@/lib/gateways/webhook-validator'
import type { SubscriptionGateway } from '@prisma/client'
import { NotificationStub } from '@/lib/notifications/stubs/NotificationStub'

// Mapeamento GatewayType → SubscriptionGateway (Prisma enum)
const GATEWAY_TYPE_TO_PRISMA: Record<string, SubscriptionGateway> = {
  MERCADO_PAGO: 'MERCADO_PAGO',
  PAGSEGURO:    'PAGSEGURO',
  PAYPAL:       'PAYPAL',
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
  )
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)

  // ── Rate limiting (PAYMENT_055) ──────────────────────────────────────────
  if (webhookRateLimit) {
    const { success } = await webhookRateLimit.limit(ip)
    if (!success) {
      return NextResponse.json(
        { error: 'PAYMENT_055', message: 'Rate limit excedido para webhooks' },
        { status: 429 }
      )
    }
  }

  // ── Detectar gateway pelos headers ───────────────────────────────────────
  const reqHeaders = req.headers
  const gateway    = getGatewayByHeader(reqHeaders)
  const gatewayType = detectGatewayType(reqHeaders)

  if (!gateway || !gatewayType) {
    await webhookAuditService.logWebhook({
      gateway:    'MERCADO_PAGO', // fallback para log
      status:     'REJECTED',
      hmacValid:  false,
      ipAddress:  ip,
      errorMessage: 'Gateway não detectado pelos headers',
    })
    return NextResponse.json(
      { error: 'PAYMENT_052', message: 'Gateway não identificado' },
      { status: 400 }
    )
  }

  const prismaGateway: SubscriptionGateway =
    GATEWAY_TYPE_TO_PRISMA[gatewayType.toString()] ?? 'MERCADO_PAGO'

  // ── Ler body como texto (necessário para validação HMAC) ─────────────────
  const rawBody = await req.text()

  // ── Validar HMAC ──────────────────────────────────────────────────────────
  let hmacValid = false
  try {
    hmacValid = await validateWebhookByGateway(reqHeaders, rawBody, gatewayType)
  } catch {
    hmacValid = false
  }

  if (!hmacValid) {
    await webhookAuditService.logWebhook({
      gateway:      prismaGateway,
      status:       'REJECTED',
      hmacValid:    false,
      ipAddress:    ip,
      errorMessage: 'HMAC inválido — PAYMENT_001',
    })
    return NextResponse.json(
      { error: 'PAYMENT_001', message: 'Assinatura HMAC inválida' },
      { status: 401 }
    )
  }

  // ── Parsear evento ────────────────────────────────────────────────────────
  let event: Awaited<ReturnType<typeof gateway.parseWebhookEvent>>
  try {
    event = gateway.parseWebhookEvent(rawBody)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao parsear payload'
    await webhookAuditService.logWebhook({
      gateway:      prismaGateway,
      status:       'REJECTED',
      hmacValid:    true,
      ipAddress:    ip,
      errorMessage: msg,
    })
    return NextResponse.json(
      { error: 'PAYMENT_003', message: msg },
      { status: 200 } // retornar 200 para que o gateway não reenvie
    )
  }

  // ── Idempotência: verificar se transação já foi processada ───────────────
  if (event.transactionId) {
    const existing = await prisma.payment.findUnique({
      where: { gatewayTransactionId: event.transactionId },
    })

    if (existing) {
      await webhookAuditService.logWebhook({
        gateway:        prismaGateway,
        eventType:      event.eventType,
        transactionId:  event.transactionId,
        subscriptionId: event.subscriptionId,
        status:         'DUPLICATE',
        hmacValid:      true,
        ipAddress:      ip,
      })
      return NextResponse.json({ status: 'already_processed' })
    }
  }

  // ── Processar por eventType ───────────────────────────────────────────────
  try {
    const subscription = await prisma.subscription.findUnique({
      where: { id: event.subscriptionId },
      select: { userId: true, id: true },
    })

    if (!subscription) {
      await webhookAuditService.logWebhook({
        gateway:        prismaGateway,
        eventType:      event.eventType,
        transactionId:  event.transactionId,
        subscriptionId: event.subscriptionId,
        status:         'REJECTED',
        hmacValid:      true,
        ipAddress:      ip,
        errorMessage:   `subscriptionId não encontrada: ${event.subscriptionId}`,
      })
      return NextResponse.json({ status: 'processed' }) // 200 para não reenviar
    }

    switch (event.eventType) {
      case 'PAYMENT_CONFIRMED': {
        await planService.upgradeUser(subscription.userId, subscription.id)

        // Salvar payment PCI-safe
        await prisma.payment.create({
          data: {
            userId:               subscription.userId,
            subscriptionId:       subscription.id,
            amount:               event.amount,
            gateway:              prismaGateway,
            gatewayTransactionId: event.transactionId,
            gatewayMeta:          { gateway: event.gateway }, // sem PAN/CVV
            status:               'PAID',
            processedAt:          new Date(),
          },
        })

        await NotificationStub.notify(subscription.userId, 'PAYMENT_CONFIRMED', {
          subscriptionId: subscription.id,
          amount: event.amount,
        })
        break
      }

      case 'PAYMENT_FAILED': {
        // Subscription permanece PENDING
        await prisma.payment.create({
          data: {
            userId:               subscription.userId,
            subscriptionId:       subscription.id,
            amount:               event.amount,
            gateway:              prismaGateway,
            gatewayTransactionId: event.transactionId,
            gatewayMeta:          { gateway: event.gateway },
            status:               'FAILED',
            processedAt:          new Date(),
          },
        })

        await NotificationStub.notify(subscription.userId, 'PAYMENT_FAILED', {
          subscriptionId: subscription.id,
        })
        break
      }

      case 'REFUND_COMPLETED': {
        // Cancelar subscription (usa cancelSubscription do SubscriptionService via planService)
        await prisma.$transaction([
          prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          }),
          prisma.payment.create({
            data: {
              userId:               subscription.userId,
              subscriptionId:       subscription.id,
              amount:               event.amount,
              gateway:              prismaGateway,
              gatewayTransactionId: event.transactionId,
              gatewayMeta:          { gateway: event.gateway },
              status:               'REFUNDED',
              processedAt:          new Date(),
            },
          }),
        ])

        await NotificationStub.notify(subscription.userId, 'PLAN_CANCEL_ALERT', {
          subscriptionId: subscription.id,
        })
        break
      }
    }

    // ── Audit log: ACCEPTED ────────────────────────────────────────────────
    await webhookAuditService.logWebhook({
      gateway:        prismaGateway,
      eventType:      event.eventType,
      transactionId:  event.transactionId,
      subscriptionId: event.subscriptionId,
      status:         'ACCEPTED',
      hmacValid:      true,
      ipAddress:      ip,
    })

    return NextResponse.json({ status: 'processed' })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    console.error('[webhook] Erro ao processar evento:', msg)

    await webhookAuditService.logWebhook({
      gateway:        prismaGateway,
      eventType:      event.eventType,
      transactionId:  event.transactionId,
      subscriptionId: event.subscriptionId,
      status:         'REJECTED',
      hmacValid:      true,
      ipAddress:      ip,
      errorMessage:   msg,
    })

    return NextResponse.json(
      { error: 'SYS_001', message: 'Erro interno ao processar webhook' },
      { status: 500 }
    )
  }
}
