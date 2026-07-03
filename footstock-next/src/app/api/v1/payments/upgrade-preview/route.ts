import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { ok, error, errors } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  calcProRataResidualCents,
  calcUpgradeBonusAmount,
  calcSubscriptionAmount,
  residualToFsCredit,
  UPGRADE_PRORATION_FS_MULTIPLIER,
} from '@/lib/services/plan-logic'
import {
  isUpgradeProrationRefundEnabled,
  upgradeProrationRefundFloorCents,
} from '@/lib/services/upgrade-proration'
import type { PlanType } from '@/lib/enums'

const PLAN_HIERARCHY: Record<string, number> = { JOGADOR: 0, CRAQUE: 1, LENDA: 2 }
const VALID_TARGETS = new Set(['CRAQUE', 'LENDA'])

// GET /api/v1/payments/upgrade-preview?plan=LENDA&period=MONTHLY
//
// M066 (estudo upgrade-pricing 2026-07-03, Fase 1a): dados da tela de disclosure do
// upgrade, calculados SERVER-SIDE (fonte única de verdade — o client nunca calcula).
// A tela exibe as 3 linhas canônicas: (1) o que ganha agora, (2) quanto paga hoje,
// (3) destino do saldo do plano antigo + próxima cobrança. O snapshot exibido volta no
// POST /checkout como upgradeConsent (prova documental, CDC 6º III/31 + Dec. 7.962).
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()
  if (auth.user.adminRole) {
    return error('AUTH-009', 'Contas administrativas não contratam planos.', 403)
  }

  const target = (request.nextUrl.searchParams.get('plan') ?? '').toUpperCase()
  const periodRaw = (request.nextUrl.searchParams.get('period') ?? 'MONTHLY').toUpperCase()
  const period = periodRaw === 'YEARLY' ? 'yearly' : 'monthly'
  if (!VALID_TARGETS.has(target)) {
    return error('VALIDATION', 'Plano alvo inválido.', 422)
  }

  const currentPlan = (auth.user.planType ?? 'JOGADOR') as PlanType
  if ((PLAN_HIERARCHY[target] ?? 0) <= (PLAN_HIERARCHY[currentPlan] ?? 0)) {
    return error('PAYMENT_054', 'O plano alvo precisa ser superior ao plano atual.', 422)
  }

  const now = new Date()
  const amountDueTodayCents = calcSubscriptionAmount(target as PlanType, period)
  const bonusDifferentialFs = calcUpgradeBonusAmount(currentPlan, target as PlanType)

  // Residual do plano atual (só existe se há assinatura paga vigente).
  let residualCents = 0
  let priorWindowEnd: string | null = null
  if (currentPlan !== 'JOGADOR') {
    const activeSub = await prisma.subscription.findFirst({
      where: { userId: auth.userId, status: 'ACTIVE', planType: currentPlan as never },
      select: {
        amount: true,
        startsAt: true,
        expiresAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    })
    if (activeSub) {
      const windowStart = activeSub.currentPeriodStart ?? activeSub.startsAt
      const windowEnd = activeSub.currentPeriodEnd ?? activeSub.expiresAt
      if (windowStart && windowEnd && activeSub.amount > 0) {
        residualCents = calcProRataResidualCents({
          amountCents: activeSub.amount,
          windowStart,
          windowEnd,
          now,
        })
        priorWindowEnd = windowEnd.toISOString()
      }
    }
  }

  // Mesma regra de decisão do upgradeUser: refund em dinheiro exige flag + piso; senão FS$.
  const refundEnabled = isUpgradeProrationRefundEnabled()
  const floorCents = upgradeProrationRefundFloorCents()
  const compensation =
    residualCents <= 0
      ? 'NONE'
      : refundEnabled && residualCents >= floorCents
        ? 'PARTIAL_REFUND'
        : 'FS_CREDIT'
  const fsCredit =
    compensation === 'FS_CREDIT'
      ? residualToFsCredit(residualCents, UPGRADE_PRORATION_FS_MULTIPLIER)
      : 0

  const nextChargeDate = new Date(now)
  if (period === 'yearly') nextChargeDate.setFullYear(nextChargeDate.getFullYear() + 1)
  else nextChargeDate.setMonth(nextChargeDate.getMonth() + 1)

  return ok({
    currentPlan,
    targetPlan: target,
    period: periodRaw,
    amountDueTodayCents,
    residualCents,
    compensation,
    fsCredit,
    fsCreditTiming: 'IMMEDIATE',
    fsMultiplier: UPGRADE_PRORATION_FS_MULTIPLIER,
    bonusDifferentialFs,
    bonusCreditDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    nextChargeDate: nextChargeDate.toISOString(),
    priorWindowEnd,
    generatedAt: now.toISOString(),
  })
}
