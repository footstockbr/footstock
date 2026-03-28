import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { SubscriptionStatus, PaymentGateway, PaymentPeriod, PlanType } from '@/types'

function serializeSubscription(s: {
  id: string; userId: string; planType: string; gateway: string
  period: string; status: string; startsAt: Date; expiresAt: Date | null
  trialEndsAt: Date | null; cancelledAt: Date | null
  cancellationLockExpiresAt: Date | null; createdAt: Date; updatedAt: Date
}) {
  return {
    id: s.id,
    userId: s.userId,
    planType: s.planType as PlanType,
    gateway: s.gateway as PaymentGateway,
    period: s.period as PaymentPeriod,
    status: s.status as SubscriptionStatus,
    startsAt: s.startsAt.toISOString(),
    expiresAt: s.expiresAt?.toISOString() ?? null,
    trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
    cancelledAt: s.cancelledAt?.toISOString() ?? null,
    cancellationLockExpiresAt: s.cancellationLockExpiresAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

// GET /api/v1/subscriptions/me
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: auth.user.id },
    })

    if (!sub || sub.status === 'CANCELLED' || sub.status === 'EXPIRED') {
      return errors.notFound('Nenhuma assinatura ativa encontrada.')
    }

    return ok(serializeSubscription(sub))
  } catch {
    return errors.server()
  }
}

// DELETE /api/v1/subscriptions/me — cancelar assinatura
export async function DELETE() {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: auth.user.id },
    })

    if (!sub) return errors.notFound('Nenhuma assinatura ativa encontrada.')

    const now = new Date()
    const daysSinceStart = (now.getTime() - sub.startsAt.getTime()) / (1000 * 60 * 60 * 24)
    const isWithinCoolingOff = daysSinceStart <= 7

    // TODO: Implementar via /auto-flow execute
    // Se > 7 dias: liquidar shorts, cancelar ordens PENDING, resetar saldo para FS$ 2.000
    // Se <= 7 dias: reembolso integral via gateway

    const cancelled = await prisma.subscription.update({
      where: { userId: auth.user.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancellationLockExpiresAt: isWithinCoolingOff ? now : null,
      },
    })

    return ok(serializeSubscription(cancelled))
  } catch {
    return errors.server()
  }
}
