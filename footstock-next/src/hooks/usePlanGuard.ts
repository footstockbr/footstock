'use client'

import useSWR from 'swr'

export type PlanTier = 'JOGADOR' | 'CRAQUE' | 'LENDA'

interface MeResponse {
  data: { planType: PlanTier }
}

interface PlanGuardResult {
  plan: PlanTier
  isLoading: boolean
  /**
   * task-020: estado de erro explicito. true quando o fetch de /api/v1/users/me
   * falhou. Antes, a falha era mascarada por um fallback silencioso para
   * 'JOGADOR', fazendo a UI parecer um downgrade de plano (um usuario LENDA via
   * recursos travados por uma falha transitoria de rede). Consumidores devem
   * tratar isError explicitamente (ex.: mostrar estado de erro/retry) em vez de
   * renderizar um downgrade implicito.
   */
  isError: boolean
  /** true somente quando ha um plano confiavel resolvido (nem loading, nem erro). */
  isReady: boolean
  /** Retorna true se o plano do usuário for >= ao tier exigido */
  hasAccess: (requiredTier: PlanTier) => boolean
}

const TIER_ORDER: Record<PlanTier, number> = {
  JOGADOR: 0,
  CRAQUE: 1,
  LENDA: 2,
}

async function fetchMe(): Promise<PlanTier> {
  const res = await fetch('/api/v1/users/me')
  // task-020: lançar em vez de coagir para 'JOGADOR'. Assim o SWR popula `error`
  // e o hook expoe isError, em vez de fingir que o usuario e do tier mais baixo.
  if (!res.ok) throw new Error(`plan-guard: /api/v1/users/me respondeu ${res.status}`)
  const json = (await res.json()) as MeResponse
  return (json.data?.planType ?? 'JOGADOR') as PlanTier
}

export function usePlanGuard(): PlanGuardResult {
  const { data: plan, isLoading, error } = useSWR<PlanTier>('plan-guard', fetchMe, {
    // task-005: a janela antiga (60s, sem revalidacao no foco) deixava os cards de
    // /planos com o tier velho apos um pagamento. Revalidar ao focar a aba (retorno
    // do gateway) e encurtar o dedupe fecha essa janela de staleness.
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  })

  const isError = Boolean(error)
  const isReady = !isLoading && !isError && plan !== undefined
  const resolvedPlan = plan ?? 'JOGADOR'

  return {
    plan: resolvedPlan,
    isLoading,
    isError,
    isReady,
    hasAccess: (requiredTier: PlanTier) =>
      TIER_ORDER[resolvedPlan] >= TIER_ORDER[requiredTier],
  }
}
