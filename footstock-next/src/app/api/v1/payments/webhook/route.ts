import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGatewayByHeader, detectGatewayType } from '@/lib/gateways/GatewayFactory'
import { GatewayRetryableError } from '@/lib/gateways/IGateway'
import { validateWebhookByGatewayDetailed } from '@/lib/gateways/webhook-validator'
import { getWebhookRateLimit } from '@/lib/ratelimit'
import { normalizeIp } from '@/middleware/rateLimit'
import { planService } from '@/lib/services/PlanService'
import { webhookAuditService } from '@/lib/services/WebhookAuditService'
import { sendNotification } from '@/lib/services/NotificationService'
import { NOTIFICATION_TYPE } from '@/lib/enums'
import { leagueEventRecorder } from '@/lib/services/leagues/LeagueEventRecorder'
import type { SubscriptionGateway } from '@prisma/client'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'

// POST /api/v1/payments/webhook
// Público — autenticado por HMAC-SHA256 (sem Bearer token)
// Qualquer erro retorna 200 silencioso para não vazar informação de segurança
// Rate limit: 1000 req / 60s por IP (TASK-026) — verificado APÓS validação HMAC
export async function POST(request: NextRequest) {
  const rawIpHeader = request.headers.get('x-forwarded-for') ?? undefined
  const ip = rawIpHeader ? normalizeIp(rawIpHeader) : '0.0.0.0'
  const originalIp = rawIpHeader?.split(',')[0]?.trim()

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
    // task-010: o corpo continua 200 silencioso (não vazar detalhe de segurança ao
    // chamador), mas a rejeição precisa ser OBSERVÁVEL — uma confirmação de pagamento
    // perdida por header de gateway desconhecido nunca pode passar despercebida.
    // Sinal: console.error [ALERT] (capturado por log/monitoramento) + audit REJECTED.
    // Inspeção pelo operador: WebhookAuditService.listLogs (painel admin), filtro status=REJECTED.
    console.error('[webhook][ALERT] Webhook rejeitado: gateway não reconhecido nos headers', {
      ipAddress: originalIp,
    })
    await webhookAuditService.logWebhook({
      gateway: 'MERCADO_PAGO' as SubscriptionGateway, // fallback para log
      status: 'REJECTED',
      hmacValid: false,
      ipAddress: originalIp,
      errorMessage: 'Gateway não reconhecido nos headers',
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const gatewayEnum = gatewayType as unknown as SubscriptionGateway

  // 3. Validar assinatura HMAC
  // IMPORTANTE: validação ANTES do rate limit para não contar webhooks inválidos (TASK-026 spec §5)
  let validation: Awaited<ReturnType<typeof validateWebhookByGatewayDetailed>>
  try {
    validation = await validateWebhookByGatewayDetailed(request.headers, rawBody, gatewayType)
  } catch {
    validation = { valid: false, reason: 'BAD_SIGNATURE' }
  }

  if (!validation.valid) {
    // task-010 + task-019: 200 silencioso no corpo (não vazar detalhe de segurança),
    // mas rejeição OBSERVÁVEL via [ALERT] + audit REJECTED. A taxonomia agora separa
    // assinatura inválida/ausente de replay/timestamp expirado — antes ambos caíam na
    // mensagem genérica "HMAC inválido", impedindo o operador de distinguir um secret/
    // template divergente (C8/task-012) de um ataque de replay/clock-skew.
    const reasonMessage =
      validation.reason === 'TIMESTAMP_EXPIRED'
        ? 'Timestamp expirado/replay (janela de replay excedida)'
        : validation.reason === 'MISSING_SIGNATURE'
          ? 'Assinatura ausente ou malformada nos headers'
          : validation.reason === 'CONFIG_MISSING'
            ? 'WEBHOOK_SECRET não configurado no servidor (CONFIG_MISSING)'
            : 'Assinatura HMAC inválida'
    console.error('[webhook][ALERT] Webhook rejeitado: validação de assinatura falhou', {
      gateway: gatewayType,
      reason: validation.reason,
      ipAddress: originalIp,
    })
    await webhookAuditService.logWebhook({
      gateway: gatewayEnum,
      status: 'REJECTED',
      hmacValid: false,
      ipAddress: originalIp,
      errorMessage: reasonMessage,
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 4. Rate limit por IP — apenas após HMAC válido (não conta webhooks inválidos)
  // Limite: 1000 req / 60s por IP.
  const webhookLimiter = getWebhookRateLimit()
  const rlResult = await webhookLimiter.limit(ip)

  if (!rlResult.success) {
    console.warn('[webhook] Rate limit excedido para IP:', ip, {
      remaining: rlResult.remaining,
      resetAt: new Date(rlResult.reset).toISOString(),
    })
    await webhookAuditService.logWebhook({
      gateway: gatewayEnum,
      status: 'REJECTED',
      hmacValid: true,
      ipAddress: originalIp,
      errorMessage: `Rate limit excedido (IP: ${ip})`,
    })
    // 429 para que o provider saiba que deve aplicar backoff (não 200 — payment provider precisa reprocessar)
    return NextResponse.json(
      { error: { code: 'RATE_001', message: 'Rate limit atingido. Reduza a frequência de envio.' } },
      { status: 429 }
    )
  }

  // Alerta de capacidade: log quando atingir 80% do limite (remaining <= 200 de 1000)
  const ALERT_THRESHOLD = Math.floor(1000 * 0.2)
  if (rlResult.remaining <= ALERT_THRESHOLD) {
    console.warn('[webhook] Uso de 80%+ do rate limit de webhook para IP:', ip, {
      remaining: rlResult.remaining,
      limit: 1000,
      resetAt: new Date(rlResult.reset).toISOString(),
    })
  }

  // 5. Parse do evento
  let event: Awaited<ReturnType<typeof gateway.parseWebhookEvent>>
  try {
    event = await gateway.parseWebhookEvent(rawBody)
  } catch (parseErr) {
    // Erro TRANSITÓRIO (ex.: GET de enriquecimento do MP falhou): o evento pode ser válido.
    // Responder 503 (retryable) e logar REJECTED (não-bloqueante para reprocessamento, pois a
    // dedup só considera ACCEPTED). NÃO devolver 200, que sinalizaria "não reenviar".
    if (parseErr instanceof GatewayRetryableError) {
      await webhookAuditService.logWebhook({
        gateway: gatewayEnum,
        status: 'REJECTED',
        hmacValid: true,
        ipAddress: originalIp,
        errorMessage: `Enriquecimento indeterminado (retry): ${parseErr.message}`,
      })
      return NextResponse.json(
        { error: { code: 'PAYMENT_ENRICH_RETRY', message: 'Status indeterminado — reenviar.' } },
        { status: 503 }
      )
    }
    // Erro TERMINAL: payload malformado ou status não mapeável. 200 para o provedor parar.
    await webhookAuditService.logWebhook({
      gateway: gatewayEnum,
      status: 'REJECTED',
      hmacValid: true,
      ipAddress: originalIp,
      errorMessage: 'Falha ao parsear evento',
    })
    return NextResponse.json({ received: true }, { status: 200 })
  }

  // 5b. Idempotência: só consideramos DUPLICATA quando já houve um ACCEPTED (processamento
  // financeiro concluído com sucesso). Logs REJECTED de tentativas anteriores que falharam NÃO
  // bloqueiam reprocessamento — é isso que permite o retry do provedor recuperar uma falha.
  if (event.transactionId) {
    const duplicate = await prisma.webhookAuditLog.findFirst({
      where: {
        transactionId: event.transactionId,
        status: 'ACCEPTED',
      },
    })
    if (duplicate) {
      await webhookAuditService.logWebhook({
        gateway: gatewayEnum,
        eventType: event.eventType,
        transactionId: event.transactionId,
        subscriptionId: event.subscriptionId,
        status: 'DUPLICATE',
        hmacValid: true,
        ipAddress: originalIp,
      })
      return NextResponse.json({ received: true }, { status: 200 })
    }
  }

  // 6. Processar evento por tipo. O ACCEPTED só é gravado APÓS os efeitos financeiros
  // concluírem (ver final do try) — assim uma falha não fica registrada como aceita e o
  // próximo reenvio do provedor reprocessa em vez de cair como duplicata.
  try {
    if (event.eventType === 'PAYMENT_CONFIRMED') {
      // Buscar subscription para obter userId
      const subscription = await prisma.subscription.findUnique({
        where: { id: event.subscriptionId },
        select: { userId: true, planType: true, period: true, amount: true, gateway: true },
      })

      if (subscription) {
        // Hardening: gateway do webhook deve bater com o da subscription
        if (subscription.gateway !== gatewayEnum) {
          console.error(
            `[webhook][ALERT] Gateway divergente — subscriptionId=${event.subscriptionId} ` +
            `subscription.gateway=${subscription.gateway} webhook.gateway=${gatewayEnum}`
          )
          await webhookAuditService.logWebhook({
            gateway: gatewayEnum, eventType: event.eventType,
            transactionId: event.transactionId, subscriptionId: event.subscriptionId,
            status: 'REJECTED', hmacValid: true, ipAddress: originalIp,
            errorMessage: `Gateway divergente: sub=${subscription.gateway} evt=${gatewayEnum}`,
          })
          return NextResponse.json({ received: true }, { status: 200 })
        }

        // Hardening: valor pago deve bater com o valor da subscription (tolerância ±1 centavo)
        const amountMatch = Math.abs(Math.round(Number(event.amount)) - Number(subscription.amount)) <= 1
        if (!amountMatch) {
          console.error(
            `[webhook][ALERT] Valor divergente — subscriptionId=${event.subscriptionId} ` +
            `subscription.amount=${subscription.amount} webhook.amount=${event.amount}`
          )
          await webhookAuditService.logWebhook({
            gateway: gatewayEnum, eventType: event.eventType,
            transactionId: event.transactionId, subscriptionId: event.subscriptionId,
            status: 'REJECTED', hmacValid: true, ipAddress: originalIp,
            errorMessage: `Valor divergente: esperado=${subscription.amount} recebido=${event.amount}`,
          })
          return NextResponse.json({ received: true }, { status: 200 })
        }

        // Ativar plano do usuário
        const upgradeResult = await planService.upgradeUser(subscription.userId, event.subscriptionId)

        // Estado terminal (CANCELLED/EXPIRED/SUSPENDED/CANCELLATION_LOCK): a assinatura NÃO
        // foi ativada. Registrar Payment PAID / comissão / analytics aqui criaria um pagamento
        // "pago" para uma assinatura morta. Logar e encerrar sem efeitos colaterais financeiros.
        if (upgradeResult === 'NOT_ACTIVATABLE') {
          console.warn(
            `[webhook] PAYMENT_CONFIRMED para assinatura em estado terminal — pagamento não registrado. ` +
            `subscriptionId=${event.subscriptionId} transactionId=${event.transactionId}`
          )
          // Decisão TERMINAL: não há o que ativar. Logar ACCEPTED para que reenvios do provedor
          // caiam como DUPLICATE (não reprocessar) — não é uma falha transitória que mereça retry.
          await webhookAuditService.logWebhook({
            gateway: gatewayEnum,
            eventType: event.eventType,
            transactionId: event.transactionId,
            subscriptionId: event.subscriptionId,
            status: 'ACCEPTED',
            hmacValid: true,
            ipAddress: originalIp,
            errorMessage: 'Assinatura em estado terminal — sem efeitos financeiros',
          })
          return NextResponse.json({ received: true }, { status: 200 })
        }

        // P5 league bonus: PLAN_UPGRADED
        leagueEventRecorder.recordForAllActiveLeagues(subscription.userId, 'PLAN_UPGRADED', { planType: subscription.planType }).catch(() => {})

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

        // EVT-022: payment_completed — track after successful payment
        const existingPaymentCount = await prisma.payment.count({
          where: { userId: subscription.userId, status: 'PAID' },
        })
        mixpanelServer.trackPaymentCompleted(subscription.userId, {
          plan: subscription.planType as 'CRAQUE' | 'LENDA',
          gateway: gatewayType,
          is_first_payment: existingPaymentCount <= 1, // <= 1 because we just upserted the current one
        })

        // ── Processar comissão de afiliado ────────────────────────────────────
        // gatewayTransactionId garante idempotência por EVENTO (não por subscription)
        // → suporta renovações mensais sem bloquear a 2ª, 3ª comissão
        await processAffiliateCommission({
          userId: subscription.userId,
          subscriptionId: event.subscriptionId,
          subscriptionAmount: Number(event.amount),
          gatewayTransactionId: event.transactionId,
          planType: subscription.planType as 'CRAQUE' | 'LENDA',
        })
      } else {
        // C4 (task-007): PAYMENT_CONFIRMED cujo subscriptionId não casa com nenhuma
        // subscription. Antes, este caminho era pulado e caía no ACCEPTED/200 final —
        // o pagamento ocorria, o plano nunca ativava e os reenvios viravam DUPLICATE,
        // sem nenhum rastro. Agora: sinal observável + status retryable (não-ACCEPTED),
        // para cobrir tanto a corrida (webhook antes do commit da sub) quanto o
        // mapeamento errado de subscriptionId (ex.: C7 PayPal), que o operador inspeciona
        // via WebhookAuditService.listLogs (painel admin) filtrando status REJECTED.
        console.error(
          `[webhook][ALERT] PAYMENT_CONFIRMED para subscriptionId inexistente — plano NÃO ativado. ` +
          `subscriptionId=${event.subscriptionId} transactionId=${event.transactionId} gateway=${gatewayType}`
        )
        await webhookAuditService.logWebhook({
          gateway: gatewayEnum,
          eventType: event.eventType,
          transactionId: event.transactionId,
          subscriptionId: event.subscriptionId,
          status: 'REJECTED',
          hmacValid: true,
          ipAddress: originalIp,
          errorMessage: 'Subscription não encontrada para PAYMENT_CONFIRMED',
        })
        return NextResponse.json(
          { error: { code: 'PAYMENT_SUB_NOT_FOUND', message: 'Subscription não encontrada — reenviar.' } },
          { status: 503 }
        )
      }
    } else if (event.eventType === 'PAYMENT_FAILED') {
      // Marcar subscription como PAST_DUE para acionar dunning
      await prisma.subscription.updateMany({
        where: { id: event.subscriptionId, status: { in: ['ACTIVE', 'PENDING'] } },
        data: { status: 'PAST_DUE' },
      })

      // Buscar subscription para obter userId e planType para analytics
      const failedSub = await prisma.subscription.findUnique({
        where: { id: event.subscriptionId },
        select: { userId: true, planType: true },
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
          userId: failedSub?.userId ?? '',
        },
      })

      // EVT-023: payment_failed — track after payment failure
      if (failedSub?.userId) {
        mixpanelServer.trackPaymentFailed(failedSub.userId, {
          plan_attempted: failedSub.planType as 'CRAQUE' | 'LENDA',
          gateway: gatewayType,
          error_code: 'GATEWAY_DECLINED',
        })
      }
    } else if (event.eventType === 'REFUND_COMPLETED') {
      const refundedSub = await prisma.subscription.findUnique({
        where: { id: event.subscriptionId },
        select: { userId: true, planType: true },
      })

      if (refundedSub) {
        // C6 (task-009): só rebaixar para JOGADOR se a subscription reembolsada for de
        // fato a vigente do usuário. Um refund tardio de um plano antigo (ex.: CRAQUE) não
        // pode derrubar um plano superior já ativo (ex.: LENDA).
        const TIER: Record<string, number> = { JOGADOR: 0, CRAQUE: 1, LENDA: 2 }
        const [user, otherActive] = await Promise.all([
          prisma.user.findUnique({
            where: { id: refundedSub.userId },
            select: { planType: true },
          }),
          prisma.subscription.findFirst({
            where: {
              userId: refundedSub.userId,
              status: 'ACTIVE',
              NOT: { id: event.subscriptionId },
            },
            select: { planType: true },
            orderBy: { createdAt: 'desc' },
          }),
        ])

        const refundedTier = TIER[refundedSub.planType] ?? 0
        const currentTier = TIER[user?.planType ?? 'JOGADOR'] ?? 0
        const hasOtherActiveGteTier =
          otherActive != null && (TIER[otherActive.planType] ?? 0) >= refundedTier

        // Downgrade apenas quando o plano vigente vem desta subscription: o tier atual do
        // usuário é exatamente o do plano reembolsado E não há outra subscription ativa de
        // tier igual/superior que sustente esse plano.
        const shouldDowngrade = currentTier === refundedTier && !hasOtherActiveGteTier

        if (shouldDowngrade) {
          await prisma.$transaction([
            prisma.subscription.update({
              where: { id: event.subscriptionId },
              data: { status: 'CANCELLED', cancelledAt: new Date() },
            }),
            prisma.user.update({
              where: { id: refundedSub.userId },
              data: { planType: 'JOGADOR', fsBalance: 2000 },
            }),
          ])
        } else {
          // Plano superior/diferente continua vigente: apenas cancelar a subscription
          // reembolsada, sem tocar em planType nem fsBalance.
          console.warn(
            `[webhook] REFUND_COMPLETED de plano não-vigente — downgrade evitado. ` +
            `subscriptionId=${event.subscriptionId} refundedTier=${refundedSub.planType} ` +
            `currentPlan=${user?.planType ?? 'JOGADOR'}`
          )
          await prisma.subscription.update({
            where: { id: event.subscriptionId },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          })
        }

        // Anular comissões PENDING da subscription reembolsada
        // VOIDED = cancelado por refund — aparece como "Anulado" na UI, não como "Processando"
        // PAID já não é revertido (responsabilidade operacional do admin via painel)
        await prisma.affiliateTransaction.updateMany({
          where: {
            subscriptionId: event.subscriptionId,
            status: 'PENDING',
          },
          data: { status: 'VOIDED' },
        })
      } else {
        await prisma.subscription.updateMany({
          where: { id: event.subscriptionId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        })
      }

      await prisma.payment.upsert({
        where: { gatewayTransactionId: event.transactionId },
        update: { status: 'REFUNDED' },
        create: {
          subscriptionId: event.subscriptionId,
          amount: event.amount,
          gateway: gatewayEnum,
          gatewayTransactionId: event.transactionId,
          status: 'REFUNDED',
          userId: refundedSub?.userId ?? '',
        },
      })
    }
  } catch (err) {
    // C5 (task-008): AUTH-009 lançado por upgradeUser (conta com adminRole) é uma condição
    // PERMANENTE, não transitória. Tratá-lo como o erro genérico abaixo gerava 503 em loop —
    // o provedor retentava indefinidamente sem nunca ativar. Aqui ele é terminal e observável:
    // 200 (provedor para de reenviar) + audit REJECTED com motivo.
    // NOTA: a política a montante (não criar a subscription para admin no checkout vs. permitir
    // admin assinar) depende da decisão da task-001/task-004 e NÃO está resolvida aqui.
    const errCode = (err as { code?: string })?.code
    if (errCode === 'AUTH-009') {
      console.error(
        `[webhook][ALERT] PAYMENT_CONFIRMED bloqueado por AUTH-009 (adminRole) — terminal, sem retry. ` +
        `subscriptionId=${event.subscriptionId} transactionId=${event.transactionId}`
      )
      await webhookAuditService.logWebhook({
        gateway: gatewayEnum,
        eventType: event.eventType,
        transactionId: event.transactionId,
        subscriptionId: event.subscriptionId,
        status: 'REJECTED',
        hmacValid: true,
        ipAddress: originalIp,
        errorMessage: 'AUTH-009: conta admin não ativável (terminal, não-retryable)',
      })
      return NextResponse.json({ received: true }, { status: 200 })
    }

    // Falha durante os efeitos financeiros (DB, gateway, etc). NÃO logar ACCEPTED — o
    // processamento não concluiu. Logar REJECTED (não-bloqueante, pois dedup só olha ACCEPTED)
    // e devolver 503 para que o provedor reenvie. O reprocessamento é idempotente:
    // payment.upsert por gatewayTransactionId, upgradeUser -> ALREADY_ACTIVE, comissão skipDuplicates.
    console.error('[webhook] Erro ao processar evento:', err)
    await webhookAuditService.logWebhook({
      gateway: gatewayEnum,
      eventType: event.eventType,
      transactionId: event.transactionId,
      subscriptionId: event.subscriptionId,
      status: 'REJECTED',
      hmacValid: true,
      ipAddress: originalIp,
      errorMessage: `Falha ao processar evento (retry): ${err instanceof Error ? err.message : String(err)}`,
    })
    return NextResponse.json(
      { error: { code: 'PAYMENT_PROCESS_RETRY', message: 'Falha transitória no processamento — reenviar.' } },
      { status: 503 }
    )
  }

  // Sucesso: efeitos financeiros concluídos. Gravar ACCEPTED agora (e não antes) garante que
  // só um processamento de fato concluído bloqueie reenvios futuros como DUPLICATE.
  await webhookAuditService.logWebhook({
    gateway: gatewayEnum,
    eventType: event.eventType,
    transactionId: event.transactionId,
    subscriptionId: event.subscriptionId,
    status: 'ACCEPTED',
    hmacValid: true,
    ipAddress: originalIp,
  })

  return NextResponse.json({ received: true }, { status: 200 })
}

// ============================================================================
// processAffiliateCommission
// Cria AffiliateTransaction (PENDING) quando um assinante referido confirma pagamento.
// Idempotente: skipDuplicates=true + unique constraint (affiliateCodeId, subscriptionId, transactionType)
// garante no máximo 1 comissão por renovação mesmo com replays do webhook.
// ============================================================================
async function processAffiliateCommission({
  userId,
  subscriptionId,
  subscriptionAmount,
  gatewayTransactionId,
  planType,
}: {
  userId: string
  subscriptionId: string
  subscriptionAmount: number
  gatewayTransactionId?: string
  planType: 'CRAQUE' | 'LENDA'
}): Promise<void> {
  try {
    // 1. Verificar se o assinante foi referido por um afiliado elegível
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referredByCode: true },
    })

    if (!user?.referredByCode) return

    // 2. Buscar o AffiliateCode do referrer (deve estar ativo e ser elegível)
    const affiliateCode = await prisma.affiliateCode.findFirst({
      where: {
        code: user.referredByCode,
        active: true,
        affiliateType: { in: ['TIME_PARCEIRO', 'INFLUENCIADOR'] },
      },
      select: {
        id: true,
        userId: true,
        commissionPercentage: true,
        affiliateType: true,
        code: true,
      },
    })

    if (!affiliateCode) return

    // Auto-referência: afiliado não pode ganhar comissão de si mesmo
    if (affiliateCode.userId === userId) return

    // 3. Calcular comissão em FS$ (subscriptionAmount * commissionPercentage)
    const commissionPct = Number(affiliateCode.commissionPercentage)
    const commissionAmount = Math.round(subscriptionAmount * commissionPct * 100) / 100

    if (commissionAmount <= 0) return

    // 4. Criar transação (idempotente via gatewayTransactionId único por evento de pagamento)
    //    skipDuplicates=true ignora silenciosamente se gatewayTransactionId já existe
    //    → replay do webhook não duplica comissão; renovações futuras geram nova linha
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma.affiliateTransaction as any).createMany({
      data: [
        {
          affiliateCodeId: affiliateCode.id,
          referredUserId: userId,
          subscriptionId,
          gatewayTransactionId: gatewayTransactionId ?? null,
          transactionType: 'SUBSCRIPTION_RENEWAL',
          amount: commissionAmount,
          commissionPercentageAtTime: commissionPct,
          status: 'PENDING',
        },
      ],
      skipDuplicates: true,
    })

    // EVT-041: affiliate_conversion
    mixpanelServer.trackAffiliateConversion(affiliateCode.userId, {
      affiliateCode: affiliateCode.code,
      affiliateType: affiliateCode.affiliateType as string,
      plan: planType,
      commissionAmount: commissionAmount.toFixed(2),
    })
  } catch (err) {
    // Logar mas não propagar — falha de comissão não impede ativação do plano
    console.error('[webhook] Erro ao processar comissão de afiliado:', err)
  }
}
