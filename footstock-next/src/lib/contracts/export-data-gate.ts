import type { PlanType } from '@/lib/enums'
import { planHasFeature } from '@/lib/auth/planAccess'

/** Contrato unico do gate de CSV operacional (Tasks 16-18). */
export const EXPORT_DATA_FEATURE = 'export_data' as const
export const EXPORT_DATA_MIN_PLAN: PlanType = 'CRAQUE'
export const EXPORT_DATA_ERROR_CODE = 'PLAN-001' as const
export const EXPORT_DATA_DENIED_MESSAGE =
  'Exportação de dados disponível a partir do plano Craque.'

export function canExportData(plan: PlanType | null | undefined): boolean {
  if (!plan) return false
  return planHasFeature(plan, EXPORT_DATA_FEATURE)
}

export function exportDataDenialExtra(): {
  feature: typeof EXPORT_DATA_FEATURE
  minPlan: PlanType
} {
  return {
    feature: EXPORT_DATA_FEATURE,
    minPlan: EXPORT_DATA_MIN_PLAN,
  }
}

export function formatExportDeniedMessage(payload?: {
  message?: string | null
  minPlan?: string | null
}): string {
  if (payload?.message) return payload.message
  const plan = payload?.minPlan ?? EXPORT_DATA_MIN_PLAN
  const pretty = plan.charAt(0) + plan.slice(1).toLowerCase()
  return `Exportação de dados disponível a partir do plano ${pretty}.`
}
