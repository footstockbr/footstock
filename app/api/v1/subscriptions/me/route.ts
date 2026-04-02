// ============================================================================
// Foot Stock — GET + DELETE /api/v1/subscriptions/me
// Consultar e cancelar assinatura do usuário logado
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { subscriptionService } from '@/lib/services/SubscriptionService'
import { isPaymentError } from '@/lib/errors/payment-errors'
import { NotificationStub } from '@/lib/notifications/stubs/NotificationStub'

async function getHandler(_req: NextRequest, { user }: AuthContext) {
  try {
    if (user.adminRole) {
      return NextResponse.json({
        success: true,
        data: { planType: 'JOGADOR', subscription: null, internalAccount: true },
      })
    }

    const subscription = await subscriptionService.getCurrentSubscription(user.id)

    if (!subscription) {
      return NextResponse.json({
        success: true,
        data: { planType: 'JOGADOR', subscription: null },
      })
    }

    return NextResponse.json({ success: true, data: subscription })
  } catch (err) {
    console.error('[subscriptions/me GET]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}

async function deleteHandler(_req: NextRequest, { user }: AuthContext) {
  try {
    if (user.adminRole) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'AUTH_009',
            message: 'Contas administrativas não possuem assinatura para cancelar.',
          },
        },
        { status: 403 }
      )
    }

    const result = await subscriptionService.cancelSubscription(user.id)

    // Notificações via G-003 stub
    if (result.isEligibleForRefund) {
      await NotificationStub.notify(user.id, 'PLAN_CANCEL_ALERT', {
        refundRequested: true,
        expiresAt: result.expiresAt.toISOString(),
      })
    } else if (result.cancellationLock) {
      await NotificationStub.notify(user.id, 'CANCELLATION_LOCK_ACTIVE', {
        expiresAt: result.cancellationLock.expiresAt,
        hoursRemaining: result.cancellationLock.hoursRemaining,
        requiresLiquidation: result.requiresLiquidation,
      })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    if (isPaymentError(err)) {
      return NextResponse.json(
        { success: false, error: { code: err.code, message: err.userMessage } },
        { status: err.statusCode }
      )
    }

    if (err instanceof Error && 'code' in err) {
      const e = err as Error & { code: string; statusCode?: number }
      return NextResponse.json(
        { success: false, error: { code: e.code, message: e.message } },
        { status: e.statusCode ?? 422 }
      )
    }

    console.error('[subscriptions/me DELETE]', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno.' } },
      { status: 500 }
    )
  }
}

export const GET = withAuth(getHandler as never)
export const DELETE = withAuth(deleteHandler as never)
