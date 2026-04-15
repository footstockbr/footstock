// ============================================================================
// Foot Stock — Gating centralizado de indicadores técnicos por plano
// Fonte: FDD ui-mercado-ativos CTA-003, USER-STORIES US-013, TASK-011
// ============================================================================

import type { PlanType, IndicatorType } from '@/lib/enums'
import { PLAN_HIERARCHY } from '@/lib/enums'

/** Plano mínimo necessário para acessar cada indicador */
const INDICATOR_MIN_PLAN: Record<IndicatorType, PlanType> = {
  OHLC: 'JOGADOR',
  VOLUME: 'JOGADOR',
  BOLLINGER: 'JOGADOR',
  OFI: 'JOGADOR',
  MM9: 'LENDA',
  MM21: 'LENDA',
  COMPARISON_MODE: 'CRAQUE',
}

/** Retorna true se o plano do usuário permite acessar o indicador */
export function canAccessIndicator(
  userPlan: PlanType,
  indicator: IndicatorType
): boolean {
  const requiredPlan = INDICATOR_MIN_PLAN[indicator]
  return PLAN_HIERARCHY[userPlan] >= PLAN_HIERARCHY[requiredPlan]
}

/** Retorna o plano mínimo para acessar um indicador (para exibir em tooltips) */
export function getMinPlanForIndicator(indicator: IndicatorType): PlanType {
  return INDICATOR_MIN_PLAN[indicator]
}

/** Retorna todos os indicadores que um plano pode acessar */
export function getAccessibleIndicators(userPlan: PlanType): IndicatorType[] {
  return (Object.keys(INDICATOR_MIN_PLAN) as IndicatorType[]).filter(
    (ind) => canAccessIndicator(userPlan, ind)
  )
}
