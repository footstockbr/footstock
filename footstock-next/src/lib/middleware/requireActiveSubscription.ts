// ============================================================================
// FootStock — requireActiveSubscription middleware
// Bloqueia ações PREMIUM quando assinatura está em CANCELLATION_LOCK
// Usa matriz de capacidades: bloqueia criação de risco, permite redução de risco
// ============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Ações que reduzem risco — SEMPRE permitidas em CANCELLATION_LOCK
// O usuário deve poder sair das posições voluntariamente nas 48h
const RISK_REDUCTION_ACTIONS = [
  'SELL_POSITION',      // venda de posição LONG
  'CLOSE_SHORT',        // fechamento de posição SHORT
  'CANCEL_ORDER',       // cancelamento de ordem própria
] as const

type RiskReductionAction = typeof RISK_REDUCTION_ACTIONS[number]

export function isRiskReductionAction(action: string): action is RiskReductionAction {
  return RISK_REDUCTION_ACTIONS.includes(action as RiskReductionAction)
}

/**
 * Verifica se o usuário está em CANCELLATION_LOCK e retorna resposta de erro se:
 * - O status é CANCELLATION_LOCK E
 * - A capacidade solicitada está bloqueada
 *
 * Capacidades BLOQUEADAS em CANCELLATION_LOCK:
 * - Abertura de novas ordens (exceto para fechar posições)
 * - Criação de posições SHORT
 * - Uso de alavancagem 2x
 * - Inscrição em novas ligas (join)
 * - Criação de novas ligas
 * - Acesso ao AI Assessor
 * - Quaisquer novas operações que aumentem exposição
 *
 * Capacidades PERMITIDAS em CANCELLATION_LOCK:
 * - Visualização de posições, saldo, histórico (readonly)
 * - Venda de posições LONG existentes
 * - Fechamento de posições SHORT existentes
 * - Cancelamento de ordens próprias
 * - Reversão do cancelamento (endpoint /revert)
 */
export async function requireActiveSubscription(
  userId: string,
  capability: 'NEW_ORDER' | 'NEW_SHORT' | 'LEVERAGE' | 'JOIN_LEAGUE' | 'CREATE_LEAGUE' | 'AI_ADVISOR'
): Promise<NextResponse | null> {
  const sub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: 'CANCELLATION_LOCK',
    },
    orderBy: { createdAt: 'desc' },
    select: { status: true, cancellationLockExpiresAt: true },
  })

  if (!sub) return null // acesso normal

  const expiresAt = sub.cancellationLockExpiresAt
  const hoursRemaining = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 3_600_000))
    : 0

  return NextResponse.json(
    {
      error: 'CANCELLATION_LOCK_ACTIVE',
      code: 'PAYMENT_054',
      message: `Sua assinatura está em processo de cancelamento. A ação "${capability}" está bloqueada. Você pode reverter o cancelamento em /configuracoes/assinatura.`,
      cancellationLock: {
        expiresAt: expiresAt?.toISOString() ?? null,
        hoursRemaining,
        revertUrl: '/configuracoes/assinatura',
      },
    },
    { status: 403 }
  )
}
