// ============================================================================
// Foot Stock — PlanDividendPolicy (T-007)
// Centraliza regras de elegibilidade de dividendo por plano.
// CRAQUE/LENDA: crédito automático em wallet.
// JOGADOR: não recebe crédito direto — yield acumula em YieldDifferentialPending.
// Rastreabilidade: T-007 §4
// ============================================================================

import { PLAN_TYPE } from '@/lib/enums'

export type PlanType = (typeof PLAN_TYPE)[keyof typeof PLAN_TYPE]

export interface DividendEligibility {
  /** Se deve creditar diretamente no saldo FS$ */
  shouldCreditDirect: boolean
  /** Se deve criar registro em yield_differential_pending */
  shouldCreatePending: boolean
  /** Motivo do bloqueio quando shouldCreditDirect = false */
  blockReason: 'BLOCKED_PLAN' | null
}

/** Determina como o dividendo deve ser processado para um dado planType */
export function getPlanDividendEligibility(planType: string | null | undefined): DividendEligibility {
  if (planType === PLAN_TYPE.CRAQUE || planType === PLAN_TYPE.LENDA) {
    return {
      shouldCreditDirect: true,
      shouldCreatePending: false,
      blockReason: null,
    }
  }

  // JOGADOR (ou planType indefinido — tratar como mais restritivo)
  return {
    shouldCreditDirect: false,
    shouldCreatePending: true,
    blockReason: 'BLOCKED_PLAN',
  }
}

/** Verifica se o usuário pode receber dividendo dado seu status */
export function isUserEligibleForDividend(params: {
  planType: string | null | undefined
  userStatus: string | null | undefined
}): { eligible: boolean; reason: string | null } {
  const { planType, userStatus } = params

  if (userStatus === 'SUSPENDED') {
    return { eligible: false, reason: 'SUSPENDED' }
  }

  // JOGADOR não recebe crédito, mas pode acumular pendente
  // A elegibilidade para crédito direto é checada separadamente em getPlanDividendEligibility
  if (!planType) {
    return { eligible: false, reason: 'NO_PLAN' }
  }

  return { eligible: true, reason: null }
}
