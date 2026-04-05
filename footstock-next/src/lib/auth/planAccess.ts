// ============================================================================
// Foot Stock — Mapa de features por plano de assinatura
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

/** Verifica se o plano do usuario atende ao plano minimo requerido */
export function hasPlanAccess(userPlan: PlanType, requiredPlan: PlanType): boolean {
  return PLAN_HIERARCHY[userPlan] >= PLAN_HIERARCHY[requiredPlan]
}

export { PLAN_FEATURES }
