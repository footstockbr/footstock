/**
 * Seed: subscriptions completo — cobre TODOS os SubscriptionStatus, Payment, DunningAttempt e WebhookAuditLog.
 * Âncoras fixas (IDs determinísticos) para uso em testes.
 * Idempotente (upsert por id).
 */
import { prisma } from '@/lib/prisma'

const now = new Date()
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)

export async function seedSubscriptionsFull() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:subscriptions-full] Seeds não executam em produção.')
  }

  // ─── Buscar usuários âncora ────────────────────────────────────────────────
  const [craque, lenda, jogador, semTour] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'craque@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'lenda@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'jogador@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'sem-tour@foot-stock.test' } }),
  ])

  if (!craque || !lenda || !jogador) {
    throw new Error('[seed:subscriptions-full] Usuários âncora não encontrados. Execute seedUsers/seedUsersLocal primeiro.')
  }

  // ─── 1. ACTIVE — Craque mensal (já existe em subscriptions.ts mas reforçamos aqui) ─
  const subCraqueActive = await prisma.subscription.upsert({
    where: { id: 'sub-craque-active' },
    create: {
      id: 'sub-craque-active',
      userId: craque.id,
      planType: 'CRAQUE',
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
      amount: 1990, // R$ 19,90
      status: 'ACTIVE',
      startsAt: d(-5),
      expiresAt: d(25),
    },
    update: { status: 'ACTIVE', expiresAt: d(25) },
  })

  await prisma.payment.upsert({
    where: { gatewayTransactionId: 'mp-txn-craque-001' },
    create: {
      id: 'pay-craque-active-001',
      userId: craque.id,
      subscriptionId: subCraqueActive.id,
      amount: 1990,
      gateway: 'MERCADO_PAGO',
      gatewayTransactionId: 'mp-txn-craque-001',
      status: 'PAID',
      processedAt: d(-5),
    },
    update: {},
  })

  // ─── 2. ACTIVE anual — Lenda ───────────────────────────────────────────────
  const subLendaActive = await prisma.subscription.upsert({
    where: { id: 'sub-lenda-active' },
    create: {
      id: 'sub-lenda-active',
      userId: lenda.id,
      planType: 'LENDA',
      gateway: 'PAGSEGURO',
      period: 'YEARLY',
      amount: 35910, // R$ 359,10 (anual com 25% desconto)
      status: 'ACTIVE',
      startsAt: d(-30),
      expiresAt: d(335),
    },
    update: { status: 'ACTIVE' },
  })

  await prisma.payment.upsert({
    where: { gatewayTransactionId: 'ps-txn-lenda-001' },
    create: {
      id: 'pay-lenda-active-001',
      userId: lenda.id,
      subscriptionId: subLendaActive.id,
      amount: 35910,
      gateway: 'PAGSEGURO',
      gatewayTransactionId: 'ps-txn-lenda-001',
      status: 'PAID',
      processedAt: d(-30),
    },
    update: {},
  })

  // ─── 3. PENDING — aguardando confirmação de pagamento ─────────────────────
  const subPending = await prisma.subscription.upsert({
    where: { id: 'sub-jogador-pending' },
    create: {
      id: 'sub-jogador-pending',
      userId: jogador.id,
      planType: 'CRAQUE',
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
      amount: 1990,
      status: 'PENDING',
      startsAt: d(0),
      expiresAt: d(30),
    },
    update: { status: 'PENDING' },
  })

  await prisma.payment.upsert({
    where: { gatewayTransactionId: 'mp-txn-jogador-pend-001' },
    create: {
      id: 'pay-jogador-pend-001',
      userId: jogador.id,
      subscriptionId: subPending.id,
      amount: 1990,
      gateway: 'MERCADO_PAGO',
      gatewayTransactionId: 'mp-txn-jogador-pend-001',
      status: 'PENDING',
    },
    update: {},
  })

  // ─── 4. TRIAL ─────────────────────────────────────────────────────────────
  const semTourUser = semTour
  if (semTourUser) {
    await prisma.subscription.upsert({
      where: { id: 'sub-semtour-trial' },
      create: {
        id: 'sub-semtour-trial',
        userId: semTourUser.id,
        planType: 'CRAQUE',
        gateway: 'MERCADO_PAGO',
        period: 'MONTHLY',
        amount: 1990,
        status: 'TRIAL',
        startsAt: d(-3),
        expiresAt: d(7),
      },
      update: { status: 'TRIAL' },
    })
  }

  // ─── 5. EXPIRED — assinatura vencida há 15 dias ───────────────────────────
  const subExpired = await prisma.subscription.upsert({
    where: { id: 'sub-craque-expired' },
    create: {
      id: 'sub-craque-expired',
      userId: craque.id,
      planType: 'CRAQUE',
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
      amount: 1990,
      status: 'EXPIRED',
      startsAt: d(-45),
      expiresAt: d(-15),
    },
    update: {},
  })

  await prisma.payment.upsert({
    where: { gatewayTransactionId: 'mp-txn-craque-expired-001' },
    create: {
      id: 'pay-craque-expired-001',
      userId: craque.id,
      subscriptionId: subExpired.id,
      amount: 1990,
      gateway: 'MERCADO_PAGO',
      gatewayTransactionId: 'mp-txn-craque-expired-001',
      status: 'PAID',
      processedAt: d(-45),
    },
    update: {},
  })

  // ─── 6. SUSPENDED — pagamento falhou, dunning ativo ──────────────────────
  const subSuspended = await prisma.subscription.upsert({
    where: { id: 'sub-lenda-suspended' },
    create: {
      id: 'sub-lenda-suspended',
      userId: lenda.id,
      planType: 'LENDA',
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
      amount: 3990,
      status: 'SUSPENDED',
      startsAt: d(-60),
      expiresAt: d(-2),
    },
    update: {},
  })

  // Pagamento FAILED que gerou a suspensão
  await prisma.payment.upsert({
    where: { gatewayTransactionId: 'mp-txn-lenda-failed-001' },
    create: {
      id: 'pay-lenda-failed-001',
      userId: lenda.id,
      subscriptionId: subSuspended.id,
      amount: 3990,
      gateway: 'MERCADO_PAGO',
      gatewayTransactionId: 'mp-txn-lenda-failed-001',
      status: 'FAILED',
      processedAt: d(-2),
      gatewayMeta: { reason: 'insufficient_funds', code: 'E301' },
    },
    update: {},
  })

  // DunningAttempts D+1 / D+3 / D+7
  const dunningData = [
    { attempt: 1, scheduledAt: d(-1), status: 'FAILED' as const, error: 'Cartão recusado' },
    { attempt: 2, scheduledAt: d(1), status: 'PENDING' as const, error: null },
    { attempt: 3, scheduledAt: d(5), status: 'PENDING' as const, error: null },
  ]

  for (const d_ of dunningData) {
    await prisma.dunningAttempt.upsert({
      where: { subscriptionId_attemptNumber: { subscriptionId: subSuspended.id, attemptNumber: d_.attempt } },
      create: {
        subscriptionId: subSuspended.id,
        attemptNumber: d_.attempt,
        gateway: 'MERCADO_PAGO',
        status: d_.status,
        scheduledAt: d_.scheduledAt,
        processedAt: d_.status === 'FAILED' ? d_.scheduledAt : null,
        errorMessage: d_.error,
      },
      update: {},
    })
  }

  // ─── 7. CANCELLATION_LOCK — cancelamento em trava de 30 dias ─────────────
  await prisma.subscription.upsert({
    where: { id: 'sub-craque-canclock' },
    create: {
      id: 'sub-craque-canclock',
      userId: craque.id,
      planType: 'CRAQUE',
      gateway: 'PAGSEGURO',
      period: 'MONTHLY',
      amount: 1990,
      status: 'CANCELLATION_LOCK',
      startsAt: d(-20),
      expiresAt: d(10),
      cancellationLockExpiresAt: d(10),
    },
    update: {},
  })

  // ─── 8. CANCELLED — cancelado com reembolso ───────────────────────────────
  const subCancelled = await prisma.subscription.upsert({
    where: { id: 'sub-lenda-cancelled' },
    create: {
      id: 'sub-lenda-cancelled',
      userId: lenda.id,
      planType: 'LENDA',
      gateway: 'PAYPAL',
      period: 'MONTHLY',
      amount: 3990,
      status: 'CANCELLED',
      startsAt: d(-90),
      expiresAt: d(-60),
      cancelledAt: d(-61),
      refundRequested: true,
    },
    update: {},
  })

  await prisma.payment.upsert({
    where: { gatewayTransactionId: 'pp-txn-lenda-refund-001' },
    create: {
      id: 'pay-lenda-refunded-001',
      userId: lenda.id,
      subscriptionId: subCancelled.id,
      amount: 3990,
      gateway: 'PAYPAL',
      gatewayTransactionId: 'pp-txn-lenda-refund-001',
      status: 'REFUNDED',
      processedAt: d(-61),
      gatewayMeta: { refund_id: 'pp-refund-abc123' },
    },
    update: {},
  })

  // ─── 9. WebhookAuditLogs — ACCEPTED / REJECTED / DUPLICATE ──────────────
  const webhooks = [
    { id: 'wh-001', status: 'ACCEPTED' as const, hmac: true, eventType: 'PAYMENT_CONFIRMED', txId: 'mp-txn-craque-001' },
    { id: 'wh-002', status: 'REJECTED' as const, hmac: false, eventType: 'PAYMENT_CONFIRMED', txId: 'mp-txn-fake-999', error: 'HMAC inválido' },
    { id: 'wh-003', status: 'DUPLICATE' as const, hmac: true, eventType: 'PAYMENT_CONFIRMED', txId: 'mp-txn-craque-001' },
    { id: 'wh-004', status: 'ACCEPTED' as const, hmac: true, eventType: 'PAYMENT_FAILED', txId: 'mp-txn-lenda-failed-001' },
    { id: 'wh-005', status: 'ACCEPTED' as const, hmac: true, eventType: 'REFUND_COMPLETED', txId: 'pp-txn-lenda-refund-001' },
  ]

  for (const wh of webhooks) {
    await prisma.webhookAuditLog.upsert({
      where: { id: wh.id },
      create: {
        id: wh.id,
        gateway: 'MERCADO_PAGO',
        eventType: wh.eventType,
        transactionId: wh.txId,
        status: wh.status,
        hmacValid: wh.hmac,
        ipAddress: '177.18.200.1',
        errorMessage: wh.error ?? null,
        processedAt: d(-1),
      },
      update: {},
    })
  }

  console.log('[seed:subscriptions-full] ✓ Subscriptions: ACTIVE(2), PENDING, TRIAL, EXPIRED, SUSPENDED, CANCELLATION_LOCK, CANCELLED')
  console.log('[seed:subscriptions-full] ✓ Payments: PAID(3), PENDING, FAILED, REFUNDED')
  console.log('[seed:subscriptions-full] ✓ DunningAttempts: D+1(FAILED), D+3(PENDING), D+7(PENDING)')
  console.log('[seed:subscriptions-full] ✓ WebhookAuditLogs: ACCEPTED(3), REJECTED, DUPLICATE')
}
