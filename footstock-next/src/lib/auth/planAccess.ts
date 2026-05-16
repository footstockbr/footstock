// ============================================================================
// FootStock — Mapa de features por plano de assinatura
// ============================================================================

import type { PlanType } from '@/lib/enums'
import { PLAN_HIERARCHY } from '@/lib/enums'

/** Features disponiveis por plano */
export type PlanFeature =
  | 'realtime_prices'
  | 'delayed_30m'
  | 'delayed_60m'
  | 'limit_orders'
  | 'oco_orders'
  | 'short_orders'
  | 'scheduled_orders'
  | 'unlimited_orders'
  | 'ai_analysis'
  | 'portfolio_metrics'
  | 'export_data'
  | 'leagues_pro'
  | 'priority_support'
  | 'no_ads'
  | 'technical_indicators_advanced' // MM9/MM21 — Lenda only (TASK-011)
  | 'asset_comparison_mode'         // Modo comparacao — Craque+ (TASK-011)
  | 'standalone_conditional_orders' // STOP_LOSS/TAKE_PROFIT fora de OCO — Lenda only (task-007)

/** Mapa de features por plano — hierarquia JOGADOR < CRAQUE < LENDA */
const PLAN_FEATURES: Record<PlanType, PlanFeature[]> = {
  JOGADOR: ['delayed_60m'],
  CRAQUE: [
    'delayed_30m',
    'limit_orders',
    'scheduled_orders',
    'ai_analysis',
    'portfolio_metrics',
    'export_data',
    'no_ads',
    'asset_comparison_mode',
  ],
  LENDA: [
    'realtime_prices',
    'limit_orders',
    'oco_orders',
    'short_orders',
    'scheduled_orders',
    'unlimited_orders',
    'ai_analysis',
    'portfolio_metrics',
    'export_data',
    'leagues_pro',
    'priority_support',
    'no_ads',
    'technical_indicators_advanced',
    'asset_comparison_mode',
    'standalone_conditional_orders',
  ],
}

/** Verifica se o plano tem acesso a uma feature especifica */
export function planHasFeature(plan: PlanType, feature: PlanFeature): boolean {
  return PLAN_FEATURES[plan]?.includes(feature) ?? false
}

/** Retorna todas as features de um plano */
export function getPlanFeatures(plan: PlanType): PlanFeature[] {
  return PLAN_FEATURES[plan] ?? []
}

/** Verifica se o plano do usuario atende ao plano minimo requerido.
 * Staff (planType=null) NUNCA tem acesso a features de plano de player. */
export function hasPlanAccess(userPlan: PlanType | null | undefined, requiredPlan: PlanType): boolean {
  if (!userPlan) return false
  return PLAN_HIERARCHY[userPlan] >= PLAN_HIERARCHY[requiredPlan]
}

export { PLAN_FEATURES }
