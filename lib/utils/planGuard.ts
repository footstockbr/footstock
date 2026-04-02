// ============================================================================
// Foot Stock — Guard de acesso por plano de assinatura
// ============================================================================

import { PLAN_TYPE, PLAN_HIERARCHY } from '@/lib/enums'
import type { PlanType } from '@/lib/enums'
import { DAILY_ORDER_LIMITS_BY_PLAN } from '@/lib/services/plan-order-limits'
import type { User } from '@/types/models'

/** Erro lancado quando o usuario tenta acessar recurso acima do seu plano */
export class PlanUpgradeError extends Error {
  readonly code = 'PLAN_LIMIT_EXCEEDED' as const
  readonly currentPlan: PlanType
  readonly requiredPlan: PlanType
  readonly upgradeTo: PlanType | null

  constructor(currentPlan: PlanType, requiredPlan: PlanType) {
    super(`Plano ${currentPlan} nao tem acesso a recursos do plano ${requiredPlan}`)
    this.name = 'PlanUpgradeError'
    this.currentPlan = currentPlan
    this.requiredPlan = requiredPlan
    this.upgradeTo = getUpgradePlan(currentPlan)
  }
}

/**
 * Verifica se o usuario tem acesso a um recurso que exige plano minimo.
 * @example checkPlanAccess(user, 'CRAQUE') => false se user.planType === 'JOGADOR'
 */
export function checkPlanAccess(user: Pick<User, 'planType'>, requiredPlan: PlanType): boolean {
  return PLAN_HIERARCHY[user.planType] >= PLAN_HIERARCHY[requiredPlan]
}

/**
 * Variante que lanca PlanUpgradeError em vez de retornar false.
 * Use em contextos onde a falha deve ser tratada como excecao.
 * @throws {PlanUpgradeError} quando o plano do usuario e insuficiente
 */
export function assertPlanAccess(user: Pick<User, 'planType'>, requiredPlan: PlanType): void {
  if (!checkPlanAccess(user, requiredPlan)) {
    throw new PlanUpgradeError(user.planType, requiredPlan)
  }
}

/** Retorna o proximo plano de upgrade */
export function getUpgradePlan(currentPlan: PlanType): PlanType | null {
  if (currentPlan === PLAN_TYPE.JOGADOR) return PLAN_TYPE.CRAQUE
  if (currentPlan === PLAN_TYPE.CRAQUE) return PLAN_TYPE.LENDA
  return null
}

/**
 * Verifica se o usuario excedeu o limite diario de ordens do seu plano.
 * @returns true se AINDA pode criar ordens, false se atingiu o limite
 */
export function checkDailyOrderLimit(userPlan: PlanType, currentDayOrders: number): boolean {
  const dailyLimit = DAILY_ORDER_LIMITS_BY_PLAN[userPlan]
  if (dailyLimit === Infinity) return true
  return currentDayOrders < dailyLimit
}
