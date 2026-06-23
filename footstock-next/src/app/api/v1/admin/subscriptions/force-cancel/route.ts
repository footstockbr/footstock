// ============================================================================
// FootStock — POST /api/v1/admin/subscriptions/force-cancel
// SuperAdmin: força cancelamento imediato por razão de compliance
// Casos de uso: suspeita de fraude, violação de TOS, ordem judicial
// Auditoria obrigatória: toda execução registrada em admin_market_actions
// ============================================================================

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

const ForceCancelSchema = z.object({
  userId: z.string().min(1, 'userId é obrigatório'),
  reason: z.enum([
    'FRAUD_SUSPICION',
    'TOS_VIOLATION',
    'JUDICIAL_ORDER',
    'COMPLIANCE_FLAG',
    'MANUAL_OVERRIDE',
  ]),
  notes: z.string().max(500).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  // Apenas SuperAdmin pode forçar cancelamento
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return errors.forbidden('Apenas SuperAdmin pode forçar cancelamento de assinatura.')
  }

  const body = await request.json().catch(() => null)
  if (!body) return errors.validation('Body JSON inválido.')

  const parsed = ForceCancelSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation(parsed.error.issues.map((e) => e.message).join('; '))
  }

  const { userId, reason, notes } = parsed.data
  const now = new Date()

  try {
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'TRIAL', 'CANCELLATION_LOCK'] } },
      orderBy: { createdAt: 'desc' },
    })

    if (!sub) {
      return errors.notFound('Nenhuma assinatura ativa ou em trava encontrada para este usuário.')
    }

    // Executa cancelamento imediato + reset de saldo em transação atômica
    await prisma.$transaction(async (tx) => {
      // FIX-17: captura o saldo ANTES do reset para a trilha de auditoria.
      // Decisão (Task 17, DECIDIDO 2026-06-22): o force-cancel NÃO faz estorno
      // automático do saldo. Resetar para o padrão JOGADOR (2000 FS$) é a regra
      // anti-abuso vigente, não um estorno; o fsBalance anterior é apenas
      // registrado no audit para que um operador decida sobre estorno manual
      // fora deste fluxo. Sem este registro, o saldo pré-cancelamento se perderia.
      const balanceBefore = await tx.user.findUnique({
        where: { id: userId },
        select: { fsBalance: true, marginBlocked: true },
      })

      // Encerrar todas as posições abertas
      await tx.position.updateMany({
        where: { userId, status: 'OPEN' },
        data: { status: 'CLOSED', quantity: 0 },
      })

      // Cancelar ordens pendentes
      await tx.order.updateMany({
        where: { userId, status: { in: ['OPEN', 'PARTIAL'] } },
        data: { status: 'CANCELLED' },
      })

      // Resetar usuário
      await tx.user.update({
        where: { id: userId },
        data: { planType: 'JOGADOR', fsBalance: 2000, marginBlocked: 0 },
      })

      // Cancelar assinatura com todos os campos de lock limpos
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancellationLockStartedAt: null,
          cancellationLockExpiresAt: null,
        },
      })

      // Encerrar checkouts/renovações pendentes do usuário. Sem isto, um webhook
      // válido de uma PENDING antiga poderia ativar plano após o force-cancel.
      await tx.subscription.updateMany({
        where: {
          userId,
          id: { not: sub.id },
          status: { in: ['PENDING', 'PAST_DUE', 'TRIALING'] },
        },
        data: { status: 'CANCELLED', cancelledAt: now },
      })

      // Registro de auditoria obrigatório
      await tx.adminMarketAction.create({
        data: {
          adminId: auth.user.id,
          action: 'FORCE_CANCEL',
          reason: `ADMIN_FORCE_CANCEL_${reason}`,
          details: {
            subscriptionId: sub.id,
            targetUserId: userId,
            adminEmail: auth.user.email,
            reason,
            notes: notes ?? null,
            executedAt: now.toISOString(),
            // FIX-17: saldo anterior registrado para auditoria; sem estorno
            // automático. Operador decide sobre estorno manual a partir destes
            // valores. fsBalanceAfter fixo em 2000 (reset anti-abuso JOGADOR).
            previousFsBalance: balanceBefore?.fsBalance ?? null,
            previousMarginBlocked: balanceBefore?.marginBlocked ?? null,
            fsBalanceAfter: 2000,
            automaticRefund: false,
          },
        },
      })

      // Notificação ao usuário
      await tx.notification.create({
        data: {
          userId,
          type: 'PLAN_CANCEL_ALERT',
          title: 'Sua assinatura foi cancelada',
          body: 'Sua assinatura foi encerrada administrativamente. Entre em contato com o suporte para mais informações.',
          isRead: false,
        },
      })
    })

    return ok({
      cancelled: true,
      userId,
      subscriptionId: sub.id,
      reason,
      cancelledAt: now.toISOString(),
    })
  } catch (err) {
    console.error('[admin/subscriptions/force-cancel] Erro:', err)
    return errors.server()
  }
}
