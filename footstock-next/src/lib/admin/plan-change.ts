/**
 * Politica canonica de troca de plano pelo admin (FIX-02 / Task 04).
 *
 * Fonte unica da decisao "admin pode trocar este usuario para este plano?".
 * Usada pelo PATCH /api/v1/admin/users/[id] para garantir que TODA mudanca de
 * plano feita pelo admin resulte em Subscription coerente com User.planType
 * (invariante C2), aplicando o guard AUTH-009 (conta admin nao tem plano de
 * player) e a politica de downgrade (downgrade arbitrario bloqueado).
 *
 * Mantida pura (sem Prisma/IO) para ser testavel isoladamente. Os efeitos
 * transacionais (cancelar subs anteriores + criar Subscription ACTIVE + audit)
 * vivem no route handler que consome `decidePlanChange`.
 */

export const PLAN_HIERARCHY = { JOGADOR: 0, CRAQUE: 1, LENDA: 2 } as const

export type PlanType = keyof typeof PLAN_HIERARCHY

/** Subconjunto de User suficiente para decidir a troca de plano. */
export interface PlanChangeUser {
  adminRole?: string | null
  userType?: string | null
  planType?: string | null
}

/**
 * Conta administrativa/institucional nao possui plano de player.
 * Espelha o guard AUTH-009 de `PlanService.upgradeUser` (qualquer adminRole) e
 * estende para userType institucional (ADMIN/CLUB_PARTNER) por defesa em
 * profundidade.
 */
export function isStaffAccount(user: PlanChangeUser): boolean {
  if (user.adminRole) return true
  const t = user.userType ?? ''
  return t === 'ADMIN' || t === 'CLUB_PARTNER'
}

export type PlanChangeKind = 'NOOP' | 'UPGRADE' | 'DOWNGRADE'

/** Classifica a direcao da troca em relacao ao plano atual (JOGADOR default). */
export function classifyPlanChange(
  currentPlan: string | null | undefined,
  newPlan: PlanType,
): PlanChangeKind {
  const current = (currentPlan ?? 'JOGADOR') as PlanType
  const from = PLAN_HIERARCHY[current] ?? 0
  const to = PLAN_HIERARCHY[newPlan]
  if (to === from) return 'NOOP'
  return to > from ? 'UPGRADE' : 'DOWNGRADE'
}

export type PlanChangeDecision =
  | { action: 'NOOP' }
  | { action: 'APPLY'; from: PlanType; to: PlanType }
  | { action: 'REJECT'; code: string; status: number; message: string }

/**
 * Decide o destino de uma troca de plano solicitada pelo admin.
 *
 * - Conta staff -> REJECT AUTH-009 (403).
 * - Downgrade -> REJECT ADMIN-PLAN-DOWNGRADE (400): downgrade arbitrario nao e
 *   permitido por este caminho (reversoes passam pelo fluxo de cancelamento).
 * - Mesmo plano -> NOOP (nenhuma Subscription nova; demais campos do PATCH
 *   ainda podem ser aplicados pelo caller).
 * - Upgrade valido -> APPLY (caller materializa a Subscription coerente + audit).
 */
export function decidePlanChange(
  user: PlanChangeUser,
  newPlan: PlanType,
): PlanChangeDecision {
  if (isStaffAccount(user)) {
    return {
      action: 'REJECT',
      code: 'AUTH-009',
      status: 403,
      message: 'Contas administrativas/institucionais nao possuem plano de player.',
    }
  }

  const kind = classifyPlanChange(user.planType, newPlan)
  if (kind === 'NOOP') return { action: 'NOOP' }
  if (kind === 'DOWNGRADE') {
    return {
      action: 'REJECT',
      code: 'ADMIN-PLAN-DOWNGRADE',
      status: 400,
      message: 'Downgrade de plano nao e permitido por este caminho. Use o fluxo de cancelamento.',
    }
  }

  return {
    action: 'APPLY',
    from: (user.planType ?? 'JOGADOR') as PlanType,
    to: newPlan,
  }
}
