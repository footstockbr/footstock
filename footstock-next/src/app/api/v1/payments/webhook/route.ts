import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getGatewayByHeader, detectGatewayType, getGateway } from '@/lib/gateways/GatewayFactory'
import { GatewayRetryableError, GatewayType } from '@/lib/gateways/IGateway'
import { env } from '@/lib/env'
import { validateWebhookByGatewayDetailed } from '@/lib/gateways/webhook-validator'
import { getWebhookRateLimit } from '@/lib/ratelimit'
import { normalizeIp } from '@/middleware/rateLimit'
import { planService } from '@/lib/services/PlanService'
import { webhookAuditService } from '@/lib/services/WebhookAuditService'
import type { SubscriptionGateway } from '@prisma/client'
import { mixpanelServer } from '@/lib/services/analytics/MixpanelServerService'
import { liquidateRestrictedPositions } from '@/lib/services/forced-liquidation'
import { isPaidPlan } from '@/lib/enums'

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
  // Spec MP: o data.id usado no manifesto HMAC vem do query param da URL de notificação
  // (`?data.id=...`), que o MP anexa à notification_url. Usamos URL padrão (web) em vez de
  // request.nextUrl por robustez contra variações de runtime.
  let dataIdFromUrl: string | undefined
  try {
    dataIdFromUrl = new URL(request.url).searchParams.get('data.id') ?? undefined
  } catch {
    dataIdFromUrl = undefined
  }
  try {
    validation = await validateWebhookByGatewayDetailed(request.headers, rawBody, gatewayType, dataIdFromUrl)
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
        gateway: gatewayEnum,
        eventType: event.eventType,
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

        // ST007 — validar o planType castado ANTES de qualquer efeito financeiro. Sem isto,
        // `subscription.planType as 'CRAQUE' | 'LENDA'` mascara um valor inesperado (ex.: JOGADOR,
        // enum novo, dado corrompido) e migraria o usuário para um "plano indefinido". Rejeição
        // terminal (não-retryable): o planType da subscription não muda por reenvio. Observável
        // via [ALERT] + audit REJECTED; 200 para o provedor parar.
        if (!isPaidPlan(subscription.planType)) {
          console.error(
            `[webhook][ALERT] PAYMENT_CONFIRMED com planType inválido/não-pagável — plano NÃO migrado. ` +
            `subscriptionId=${event.subscriptionId} planType=${String(subscription.planType)} ` +
            `transactionId=${event.transactionId}`
          )
          await webhookAuditService.logWebhook({
            gateway: gatewayEnum, eventType: event.eventType,
            transactionId: event.transactionId, subscriptionId: event.subscriptionId,
            status: 'REJECTED', hmacValid: true, ipAddress: originalIp,
            errorMessage: `planType inválido/não-pagável: ${String(subscription.planType)}`,
          })
          return NextResponse.json({ received: true }, { status: 200 })
        }
        const validPlanType = subscription.planType

        // Ativar plano do usuário. event.transactionId = occurrence_marker do pagamento
        // (Task 11 > "Idempotencia"): garante idempotency_key distinta por cobrança, inclusive
        // em renovação que reativa a mesma subscription via dunning (senão a confirmação da
        // renovação seria deduplicada na idempotency_key da ativação original — Zero Silêncio).
        const upgradeResult = await planService.upgradeUser(
          subscription.userId, event.subscriptionId, event.transactionId
        )

        // FIX-01 — Estado terminal (CANCELLED/EXPIRED/SUSPENDED/CANCELLATION_LOCK): a assinatura
        // NÃO foi ativada. Registrar Payment PAID / comissão / analytics aqui criaria um pagamento
        // "pago" que ativa um plano morto. MAS o dinheiro FOI capturado pelo gateway — antes este
        // ramo logava ACCEPTED e respondia 200 SEM criar Payment algum: o caixa real desaparecia do
        // lado do app (zero rastro, reenvios viravam DUPLICATE, refund impossível de rastrear).
        // Agora: registrar Payment CAPTURED_NOT_ACTIVATED (idempotente por gatewayTransactionId) +
        // audit REJECTED estruturado + política de refund ALERTA-PRIMEIRO. NUNCA ACCEPTED sem Payment.
        if (upgradeResult === 'NOT_ACTIVATABLE') {
          const settlement = await settleOrphanCapture({
            userId: subscription.userId,
            subscriptionId: event.subscriptionId,
            planType: validPlanType,
            amountCents: Number(event.amount),
            gateway: gatewayEnum,
            gatewayTransactionId: event.transactionId,
          })
          // Alerta OBSERVÁVEL (capturado por log/monitoramento) — captura órfã nunca passa
          // despercebida. Inspeção pelo operador: WebhookAuditService.listLogs, filtro REJECTED.
          console.error(
            `[webhook][ALERT] PAYMENT_CONFIRMED capturado para assinatura em estado terminal — ` +
            `plano NÃO ativado. payment=${settlement.paymentStatus} refunded=${settlement.refunded} ` +
            `motivo="${settlement.reason}" subscriptionId=${event.subscriptionId} ` +
            `transactionId=${event.transactionId}`
          )
          await webhookAuditService.logWebhook({
            gateway: gatewayEnum,
            eventType: event.eventType,
            transactionId: event.transactionId,
            subscriptionId: event.subscriptionId,
            // REJECTED (não ACCEPTED): houve captura sem ativação — exige atenção do operador.
            // Não bloqueia reprocessamento (dedup só olha ACCEPTED); o settlement é idempotente.
            status: 'REJECTED',
            hmacValid: true,
            ipAddress: originalIp,
            errorMessage:
              `Assinatura em estado terminal — Payment ${settlement.paymentStatus} registrado, sem ativação. ` +
              `Refund=${settlement.refunded ? 'executado' : 'não-executado'} (${settlement.reason})`,
          })
          // Terminal: a assinatura não vai mudar de estado por reenvio. 200 para o provedor parar;
          // o Payment idempotente garante que um eventual replay não duplique caixa nem refund.
          return NextResponse.json({ received: true }, { status: 200 })
        }

        // Efeitos pos-ativacao (Payment, bonus de liga PLAN_UPGRADED, analytics payment_completed
        // e comissao de afiliado), agora compartilhados com a reconciliacao server-side
        // (replay/cron) via PlanService.applyPaymentConfirmedEffects, para que um pagamento
        // recuperado fora do webhook gere os MESMOS efeitos (item 12). Idempotente por
        // gatewayTransactionId (os efeitos best-effort so disparam na primeira consolidacao).
        await planService.applyPaymentConfirmedEffects({
          userId: subscription.userId,
          subscriptionId: event.subscriptionId,
          amountCents: Number(event.amount),
          gateway: gatewayEnum,
          gatewayTransactionId: event.transactionId,
          planType: validPlanType,
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
      // FIX-04 (Task 12): PAYMENT_FAILED transiciona a assinatura DIRETO para EXPIRED, e não
      // para PAST_DUE. PAST_DUE era um estado-sink latente: nenhum processo o retirava de lá.
      // subscription-expiry só transiciona status=ACTIVE; DunningService só consome
      // EXPIRED (e PENDING com tentativa); o único caminho de saída de PAST_DUE era
      // PAST_DUE -> ACTIVE via upgradeUser numa recuperação de pagamento. Sem essa
      // recuperação, a assinatura ficava presa em PAST_DUE para sempre, mantendo acesso e
      // sem nunca cair para JOGADOR. EXPIRED é consumido tanto pelo DunningService
      // (retentativas D+1/D+3/D+7) quanto pelo subscription-expiry (suspensão/downgrade),
      // eliminando o sink na origem (alinhado ao comportamento atual do DunningService).
      // Buscar a sub ANTES da transição: precisamos de expiresAt para garantir que ela fique
      // não-nula ao virar EXPIRED — o DunningService faz deref `expiresAt!` sem filtrá-lo no
      // WHERE, logo um EXPIRED com expiresAt nulo (ex.: PENDING que nunca teve vigência) o
      // derrubaria. Carimbar "agora" quando ausente dá âncora temporal ao ciclo de dunning.
      const failedSub = await prisma.subscription.findUnique({
        where: { id: event.subscriptionId },
        select: { userId: true, planType: true, expiresAt: true },
      })

      await prisma.subscription.updateMany({
        where: { id: event.subscriptionId, status: { in: ['ACTIVE', 'PENDING'] } },
        data: {
          status: 'EXPIRED',
          // Coalesce: preserva uma vigência futura existente; só estampa now() quando nula.
          ...(failedSub?.expiresAt ? {} : { expiresAt: new Date() }),
        },
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
      // ST008 — early-return idempotente: se já existe um Payment REFUNDED para esta
      // transação, o estorno já foi processado. A dedup do passo 5b só pega quando houve
      // ACCEPTED prévio; uma reentrega do provedor após a tx commitar mas antes do ACCEPTED
      // ser gravado (janela de crash) escaparia e RESETARIA o fsBalance para 2000 de novo
      // (dupla reversão, perda de saldo legítimo). O guard por Payment REFUNDED fecha isso.
      if (event.transactionId) {
        const alreadyRefunded = await prisma.payment.findUnique({
          where: { gatewayTransactionId: event.transactionId },
          select: { status: true },
        })
        if (alreadyRefunded?.status === 'REFUNDED') {
          await webhookAuditService.logWebhook({
            gateway: gatewayEnum, eventType: event.eventType,
            transactionId: event.transactionId, subscriptionId: event.subscriptionId,
            status: 'DUPLICATE', hmacValid: true, ipAddress: originalIp,
            errorMessage: 'REFUND_COMPLETED já processado (early-return idempotente)',
          })
          return NextResponse.json({ received: true }, { status: 200 })
        }
      }

      const refundedSub = await prisma.subscription.findUnique({
        where: { id: event.subscriptionId },
        select: { userId: true, planType: true, cancelledAt: true },
      })

      if (refundedSub) {
        // C6 (task-009): só rebaixar para JOGADOR se a subscription reembolsada for de
        // fato a vigente do usuário. Um refund tardio de um plano antigo (ex.: CRAQUE) não
        // pode derrubar um plano superior já ativo (ex.: LENDA).
        const TIER: Record<string, number> = { JOGADOR: 0, CRAQUE: 1, LENDA: 2 }
        const [user, otherActiveSubs] = await Promise.all([
          prisma.user.findUnique({
            where: { id: refundedSub.userId },
            select: { planType: true },
          }),
          prisma.subscription.findMany({
            where: {
              userId: refundedSub.userId,
              status: 'ACTIVE',
              NOT: { id: event.subscriptionId },
            },
            select: { planType: true },
          }),
        ])

        const refundedTier = TIER[refundedSub.planType] ?? 0
        const currentTier = TIER[user?.planType ?? 'JOGADOR'] ?? 0
        const hasOtherActiveGteTier =
          otherActiveSubs.some((sub) => (TIER[sub.planType] ?? 0) >= refundedTier)

        // Downgrade apenas quando o plano vigente vem desta subscription: o tier atual do
        // usuário é exatamente o do plano reembolsado E não há outra subscription ativa de
        // tier igual/superior que sustente esse plano.
        const shouldDowngrade = currentTier === refundedTier && !hasOtherActiveGteTier
        const refundCompletedAt = refundedSub.cancelledAt ?? new Date()

        // FIX-08: ao rebaixar para JOGADOR via refund externo, liquidar posições
        // restritas (SHORT, alavancada) + cancelar ordens OCO/SCHEDULED ANTES do
        // downgrade — nunca deixar posição órfã. Diferente da rota self-service, o
        // estorno aqui já foi processado pelo gateway (irreversível), então NÃO há
        // como bloquear: liquidação é best-effort e qualquer resíduo gera ALERTA
        // observável para acompanhamento manual do suporte.
        if (shouldDowngrade) {
          const liquidation = await liquidateRestrictedPositions(
            refundedSub.userId,
            event.subscriptionId,
            'REFUND_COMPLETED_WEBHOOK',
          ).catch((err) => {
            console.error(`[webhook][ALERT] REFUND_COMPLETED falha na liquidação. sub=${event.subscriptionId}:`, err)
            return null
          })
          if (!liquidation || !liquidation.cleared) {
            console.error(
              `[webhook][ALERT] REFUND_COMPLETED liquidação incompleta — downgrade prossegue ` +
              `(estorno externo irreversível). sub=${event.subscriptionId} ` +
              `remaining=${liquidation?.remaining ?? 'unknown'} failed=${liquidation?.failed ?? 'unknown'}`,
            )
          }
        }

        await prisma.$transaction(async (tx) => {
          if (shouldDowngrade) {
            await tx.subscription.update({
              where: { id: event.subscriptionId },
              data: {
                status: 'CANCELLED',
                cancelledAt: refundCompletedAt,
                refundRequested: true,
                previousPlanType: refundedSub.planType,
              },
            })
            await tx.user.update({
              where: { id: refundedSub.userId },
              data: { planType: 'JOGADOR', fsBalance: 2000 },
            })
          } else {
            // Plano superior/diferente continua vigente: apenas cancelar a subscription
            // reembolsada, sem tocar em planType nem fsBalance.
            console.warn(
              `[webhook] REFUND_COMPLETED de plano não-vigente — downgrade evitado. ` +
              `subscriptionId=${event.subscriptionId} refundedTier=${refundedSub.planType} ` +
              `currentPlan=${user?.planType ?? 'JOGADOR'}`
            )
            await tx.subscription.update({
              where: { id: event.subscriptionId },
              data: {
                status: 'CANCELLED',
                cancelledAt: refundCompletedAt,
                refundRequested: true,
                previousPlanType: refundedSub.planType,
              },
            })
          }

          // Anular comissões PENDING da subscription reembolsada.
          // VOIDED = cancelado por refund — aparece como "Anulado" na UI, não como "Processando".
          // PAID já não é revertido (responsabilidade operacional do admin via painel).
          await tx.affiliateTransaction.updateMany({
            where: {
              subscriptionId: event.subscriptionId,
              status: 'PENDING',
            },
            data: { status: 'VOIDED' },
          })

          await tx.payment.upsert({
            where: { gatewayTransactionId: event.transactionId },
            update: { status: 'REFUNDED' },
            create: {
              subscriptionId: event.subscriptionId,
              amount: event.amount,
              gateway: gatewayEnum,
              gatewayTransactionId: event.transactionId,
              status: 'REFUNDED',
              userId: refundedSub.userId,
            },
          })
        })
      } else {
        console.error(
          `[webhook][ALERT] REFUND_COMPLETED para subscriptionId inexistente. ` +
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
          errorMessage: 'Subscription não encontrada para REFUND_COMPLETED',
        })
        return NextResponse.json(
          { error: { code: 'REFUND_SUB_NOT_FOUND', message: 'Subscription não encontrada — reenviar.' } },
          { status: 503 }
        )
      }
    } else if (event.eventType === 'SUBSCRIPTION_RENEWED') {
      // task-007: ciclo recorrente cobrado com sucesso (subscription_authorized_payment aprovado).
      // Registrar o Payment PAID (caixa real do ciclo — Zero Silêncio) e estender a vigência.
      // NÃO reusa applyPaymentConfirmedEffects: aquele caminho dispara comissão de afiliado +
      // bônus PLAN_UPGRADED (efeitos de PRIMEIRA compra) que não se aplicam a uma renovação.
      // Idempotente: Payment.upsert por gatewayTransactionId + dedup ACCEPTED do passo 5b (INV-2).
      const renewedSub = await prisma.subscription.findUnique({
        where: { id: event.subscriptionId },
        select: { userId: true, planType: true, period: true, gateway: true, expiresAt: true },
      })

      if (!renewedSub) {
        // Renovação cuja subscription não casa: corrida (preapproval antes do commit) ou
        // mapeamento errado. Observável + retryable (não-ACCEPTED) — nunca 200 silencioso.
        console.error(
          `[webhook][ALERT] SUBSCRIPTION_RENEWED para subscriptionId inexistente — ciclo NÃO creditado. ` +
          `subscriptionId=${event.subscriptionId} transactionId=${event.transactionId} gateway=${gatewayType}`
        )
        await webhookAuditService.logWebhook({
          gateway: gatewayEnum, eventType: event.eventType,
          transactionId: event.transactionId, subscriptionId: event.subscriptionId,
          status: 'REJECTED', hmacValid: true, ipAddress: originalIp,
          errorMessage: 'Subscription não encontrada para SUBSCRIPTION_RENEWED',
        })
        return NextResponse.json(
          { error: { code: 'SUB_RENEW_NOT_FOUND', message: 'Subscription não encontrada — reenviar.' } },
          { status: 503 }
        )
      }

      // Hardening: gateway do webhook deve bater com o da subscription.
      if (renewedSub.gateway !== gatewayEnum) {
        console.error(
          `[webhook][ALERT] SUBSCRIPTION_RENEWED gateway divergente — subscriptionId=${event.subscriptionId} ` +
          `subscription.gateway=${renewedSub.gateway} webhook.gateway=${gatewayEnum}`
        )
        await webhookAuditService.logWebhook({
          gateway: gatewayEnum, eventType: event.eventType,
          transactionId: event.transactionId, subscriptionId: event.subscriptionId,
          status: 'REJECTED', hmacValid: true, ipAddress: originalIp,
          errorMessage: `Gateway divergente: sub=${renewedSub.gateway} evt=${gatewayEnum}`,
        })
        return NextResponse.json({ received: true }, { status: 200 })
      }

      // Estende a vigência em um período a partir do fim do ciclo atual (ou de agora, se já venceu).
      const renewalBase =
        renewedSub.expiresAt && renewedSub.expiresAt.getTime() > Date.now()
          ? new Date(renewedSub.expiresAt)
          : new Date()
      const newExpiresAt = addSubscriptionPeriod(renewalBase, renewedSub.period)

      await prisma.subscription.update({
        where: { id: event.subscriptionId },
        data: {
          status: 'ACTIVE',
          gatewayStatus: 'authorized',
          currentPeriodStart: new Date(),
          currentPeriodEnd: newExpiresAt,
          expiresAt: newExpiresAt,
        },
      })

      await prisma.payment.upsert({
        where: { gatewayTransactionId: event.transactionId },
        update: { status: 'PAID', processedAt: new Date() },
        create: {
          subscriptionId: event.subscriptionId,
          amount: event.amount,
          gateway: gatewayEnum,
          gatewayTransactionId: event.transactionId,
          status: 'PAID',
          userId: renewedSub.userId,
          processedAt: new Date(),
        },
      })

      // Analytics best-effort: renovação (não é primeira compra).
      mixpanelServer.trackPaymentCompleted(renewedSub.userId, {
        plan: renewedSub.planType as 'CRAQUE' | 'LENDA',
        gateway: gatewayType,
        is_first_payment: false,
      })
    } else if (event.eventType === 'SUBSCRIPTION_PAYMENT_FAILED') {
      // task-007: falha de cobrança no ciclo recorrente. Registrar Payment FAILED (idempotente) +
      // marcar gatewayStatus para a task 008 reconciliar/dunning. NÃO expira a assinatura aqui: o
      // usuário mantém o acesso já pago até expiresAt; a renovação que falhou simplesmente não
      // estende o ciclo, e subscription-expiry/DunningService cuidam do lifecycle no vencimento.
      const failedRenewSub = await prisma.subscription.findUnique({
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
          userId: failedRenewSub?.userId ?? '',
        },
      })

      await prisma.subscription.updateMany({
        where: { id: event.subscriptionId },
        data: { gatewayStatus: 'payment_failed' },
      })

      if (failedRenewSub?.userId) {
        mixpanelServer.trackPaymentFailed(failedRenewSub.userId, {
          plan_attempted: failedRenewSub.planType as 'CRAQUE' | 'LENDA',
          gateway: gatewayType,
          error_code: 'GATEWAY_DECLINED',
        })
      }
    } else if (event.eventType === 'SUBSCRIPTION_CANCELLED') {
      // task-007: assinatura encerrada/cancelada no gateway (preapproval cancelled). Não há mais
      // renovações. Semântica cancel-at-period-end: o usuário mantém acesso até expiresAt e o
      // downgrade efetivo ocorre em subscription-expiry. Aqui apenas refletimos a intenção do
      // gateway (cancelAtPeriodEnd + gatewayStatus), sem rebaixar o plano vigente.
      const cancelledSub = await prisma.subscription.findUnique({
        where: { id: event.subscriptionId },
        select: { id: true },
      })
      if (cancelledSub) {
        await prisma.subscription.update({
          where: { id: event.subscriptionId },
          data: { cancelAtPeriodEnd: true, gatewayStatus: 'cancelled' },
        })
      } else {
        console.error(
          `[webhook][ALERT] SUBSCRIPTION_CANCELLED para subscriptionId inexistente. ` +
          `subscriptionId=${event.subscriptionId} transactionId=${event.transactionId} gateway=${gatewayType}`
        )
        await webhookAuditService.logWebhook({
          gateway: gatewayEnum, eventType: event.eventType,
          transactionId: event.transactionId, subscriptionId: event.subscriptionId,
          status: 'REJECTED', hmacValid: true, ipAddress: originalIp,
          errorMessage: 'Subscription não encontrada para SUBSCRIPTION_CANCELLED',
        })
        return NextResponse.json({ received: true }, { status: 200 })
      }
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

// NOTA (item 12): processAffiliateCommission foi movida para PlanService (private), dentro de
// applyPaymentConfirmedEffects, para ser reusada pela reconciliacao server-side (replay/cron) e
// nao apenas pelo webhook. A logica e identica (idempotente por gatewayTransactionId).

// ─── task-007: extensão de vigência de ciclo recorrente ──────────────────────────────────────
// Avança uma data em um período de assinatura (MONTHLY -> +1 mês, YEARLY -> +1 ano). Usado pelo
// handler SUBSCRIPTION_RENEWED para estender expiresAt/currentPeriodEnd a cada cobrança bem-sucedida.
function addSubscriptionPeriod(from: Date, period: 'MONTHLY' | 'YEARLY'): Date {
  const d = new Date(from)
  if (period === 'YEARLY') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d
}

// ─── FIX-01: settlement de captura órfã (NOT_ACTIVATABLE) ────────────────────────────────────
// Planos que "cobrem" uma captura — uma captura é coberta quando existe uma sub ACTIVE de tier
// IGUAL ou SUPERIOR ao plano capturado (o dinheiro corresponde a um plano vivo, estorno proibido).
const COVERING_PLANS: Record<'CRAQUE' | 'LENDA', string[]> = {
  CRAQUE: ['CRAQUE', 'LENDA'],
  LENDA: ['LENDA'],
}

type OrphanSettlement = {
  paymentStatus: 'CAPTURED_NOT_ACTIVATED' | 'REFUNDED'
  refunded: boolean
  reason: string
}

/**
 * Liquida uma captura órfã: o gateway confirmou o pagamento mas a assinatura estava em estado
 * terminal (upgradeUser → NOT_ACTIVATABLE). Garante rastro financeiro + política alerta-primeiro.
 *
 * Contrato (Aceite FIX-01):
 *  - SEMPRE registra um Payment CAPTURED_NOT_ACTIVATED idempotente por gatewayTransactionId
 *    (nunca responde ACCEPTED sem Payment).
 *  - auto-refund SOMENTE com AUTO_REFUND_ON_ORPHAN=true E órfão comprovado (sem sub ACTIVE
 *    cobrindo o tier) E idempotente (X-Idempotency-Key=refund-{paymentId} + guard de status).
 *  - PROIBIDO estornar pagamento com plano ATIVO correspondente: havendo sub ACTIVE cobrindo,
 *    o estorno é retido (refunded=false) e fica para decisão manual do operador.
 */
async function settleOrphanCapture(params: {
  userId: string
  subscriptionId: string
  planType: 'CRAQUE' | 'LENDA'
  amountCents: number
  gateway: SubscriptionGateway
  gatewayTransactionId: string
}): Promise<OrphanSettlement> {
  const { userId, subscriptionId, planType, amountCents, gateway, gatewayTransactionId } = params

  // 1. Rastro financeiro idempotente. update:{} preserva um estado já avançado (ex.: REFUNDED de
  //    um replay anterior) — nunca rebaixa o Payment de volta a CAPTURED_NOT_ACTIVATED.
  const payment = await prisma.payment.upsert({
    where: { gatewayTransactionId },
    update: {},
    create: {
      userId,
      subscriptionId,
      amount: amountCents,
      gateway,
      gatewayTransactionId,
      status: 'CAPTURED_NOT_ACTIVATED',
      processedAt: new Date(),
    },
    select: { id: true, status: true },
  })

  // 2. Idempotência de replay: já estornado → nada a fazer.
  if (payment.status === 'REFUNDED') {
    return { paymentStatus: 'REFUNDED', refunded: true, reason: 'já estornado (replay idempotente)' }
  }

  // 3. Política alerta-primeiro: sem a flag, não há estorno automático (default seguro).
  if (env.AUTO_REFUND_ON_ORPHAN !== 'true') {
    return {
      paymentStatus: 'CAPTURED_NOT_ACTIVATED',
      refunded: false,
      reason: 'auto-refund desabilitado (alerta-primeiro) — resolução manual do operador',
    }
  }

  // 4. Provar órfão: PROIBIDO estornar se há sub ACTIVE de tier >= cobrindo a captura.
  const coveringActive = await prisma.subscription.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      planType: { in: (COVERING_PLANS[planType] ?? [planType]) as never[] },
    },
    select: { id: true, planType: true },
  })
  if (coveringActive) {
    return {
      paymentStatus: 'CAPTURED_NOT_ACTIVATED',
      refunded: false,
      reason:
        `plano ATIVO correspondente (sub=${coveringActive.id} ${coveringActive.planType}) — ` +
        `estorno retido (proibido estornar pagamento com plano ativo)`,
    }
  }

  // 5. Órfão comprovado + flag on → estorno idempotente no gateway.
  try {
    const result = await getGateway(gateway as unknown as GatewayType).refundPayment(gatewayTransactionId)
    // CAS: só promove para REFUNDED a partir de CAPTURED_NOT_ACTIVATED — corrida/replay não duplica.
    await prisma.payment.updateMany({
      where: { id: payment.id, status: 'CAPTURED_NOT_ACTIVATED' },
      data: { status: 'REFUNDED' },
    })
    return {
      paymentStatus: 'REFUNDED',
      refunded: true,
      reason: result.alreadyRefunded
        ? 'estorno idempotente (gateway já havia estornado)'
        : `estorno executado (gateway refundId=${result.refundId})`,
    }
  } catch (err) {
    // Transitório: não marca REFUNDED; mantém CAPTURED_NOT_ACTIVATED para nova tentativa/operador.
    if (err instanceof GatewayRetryableError) {
      return {
        paymentStatus: 'CAPTURED_NOT_ACTIVATED',
        refunded: false,
        reason: `estorno transitório (retry): ${err.message}`,
      }
    }
    // Terminal: estorno rejeitado pelo gateway — registrar para resolução manual.
    return {
      paymentStatus: 'CAPTURED_NOT_ACTIVATED',
      refunded: false,
      reason: `estorno rejeitado pelo gateway: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
