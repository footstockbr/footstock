// ============================================================================
// FootStock — PUT /api/v1/subscriptions/me/revert
// Reverte CANCELLATION_LOCK → ACTIVE dentro da janela de reversão
// Idempotente: usa updateMany com predicados estritos para evitar race conditions
// ============================================================================

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'

export async function PUT() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const userId = auth.user.id
  const now = new Date()

  try {
    // Busca explicitamente a assinatura em CANCELLATION_LOCK. Uma assinatura
    // PENDING criada para downgrade pode ser mais recente e não deve esconder
    // a reversão disponível da assinatura superior.
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: 'CANCELLATION_LOCK' },
      orderBy: { createdAt: 'desc' },
    })

    if (!sub) {
      const activeSub = await prisma.subscription.findFirst({
        where: { userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      })
      if (activeSub) {
        return ok({ reverted: true, status: 'ACTIVE', message: 'Assinatura já está ativa.' })
      }
      return NextResponse.json(
        {
          error: 'REVERT_NOT_AVAILABLE',
          message: 'Reversão disponível apenas quando existe assinatura em CANCELLATION_LOCK.',
        },
        { status: 409 }
      )
    }

    // Janela de reversão expirou → cancelamento definitivo
    if (!sub.cancellationLockExpiresAt || sub.cancellationLockExpiresAt.getTime() <= now.getTime()) {
      return NextResponse.json(
        {
          error: 'REVERT_WINDOW_EXPIRED',
          message: 'A janela de reversão expirou. A assinatura já foi ou será cancelada definitivamente.',
        },
        { status: 422 }
      )
    }

    // Otimistic lock: updateMany com predicados estritos previne race condition com crons
    // Se o cron de encerramento já cancelou entre o findFirst e o update, count será 0
    const result = await prisma.subscription.updateMany({
      where: {
        id: sub.id,
        userId,
        status: 'CANCELLATION_LOCK',
        cancellationLockExpiresAt: { gt: now }, // ainda dentro da janela
      },
      data: {
        status: 'ACTIVE',
        cancelledAt: null,
        cancellationLockStartedAt: null,
        cancellationLockExpiresAt: null,
      },
    })

    // Race condition detectada: outro processo (cron) já processou este lock
    if (result.count === 0) {
      return NextResponse.json(
        {
          error: 'REVERT_CONCURRENT_CONFLICT',
          message: 'Não foi possível reverter. O cancelamento pode ter sido processado simultaneamente. Verifique o status atual da sua assinatura.',
        },
        { status: 409 }
      )
    }

    // Auditoria da reversão (non-blocking)
    await prisma.notification.create({
      data: {
        userId,
        type: 'PLAN_CANCEL_ALERT',
        title: 'Cancelamento revertido com sucesso',
        body: 'Seu plano foi restaurado. O cancelamento foi revertido e você continua com acesso completo.',
        isRead: false,
      },
    }).catch((err) => {
      console.error('[subscriptions/me/revert] Erro ao criar notificação:', err)
    })

    return ok({
      reverted: true,
      status: 'ACTIVE',
      message: 'Cancelamento revertido com sucesso. Sua assinatura está ativa novamente.',
    })
  } catch (err) {
    console.error('[subscriptions/me/revert] Erro:', err)
    return errors.server()
  }
}
