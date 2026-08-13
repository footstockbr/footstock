// module-20: LeagueAutoEnrollService — inscrição automática em ligas públicas
// Chamado ao concluir onboarding (tourCompleted = true) e ao fazer upgrade de plano.
// Operação idempotente: retry e concorrência produzem no máximo uma membership.
// Task 11: remove capacidade de maxMembers para ligas PUBLICA; usa repositório.

import { leagueRepository } from '@/lib/repositories/LeagueRepository'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import type { PlanType } from '@/types'

export type LeagueAutoEnrollResult =
  | { status: 'ENROLLED'; leagueId: string }
  | { status: 'ALREADY_MEMBER'; leagueId: string }
  | { status: 'NO_ACTIVE_PUBLIC_LEAGUE' }
  | { status: 'FAILED'; reason: string }

/** Mapeamento plano → divisão da liga pública correspondente */
const PLAN_TO_DIVISION: Record<PlanType, 'BRONZE' | 'PRATA' | 'OURO'> = {
  JOGADOR: 'BRONZE',
  CRAQUE:  'PRATA',
  LENDA:   'OURO',
}

export class LeagueAutoEnrollService {
  /** Retorna a divisão pública correspondente ao plano do usuário */
  getDivisionForPlan(planType: PlanType): 'BRONZE' | 'PRATA' | 'OURO' {
    return PLAN_TO_DIVISION[planType] ?? 'BRONZE'
  }

  /**
   * Inscreve o usuário na liga pública ativa de sua divisão.
   * Retorna status discriminado para feedback e rastreabilidade.
   *
   * Regras:
   * - Busca a liga PUBLICA mais recente com status ACTIVE para a divisão
   * - Se não houver liga ativa, retorna NO_ACTIVE_PUBLIC_LEAGUE
   * - Se já for membro (P2002), retorna ALREADY_MEMBER
   * - Falhas inesperadas retornam FAILED com motivo sanitizado
   */
  async enrollUserInPublicLeague(
    userId: string,
    planType: PlanType,
  ): Promise<LeagueAutoEnrollResult> {
    const division = this.getDivisionForPlan(planType)

    const league = await leagueRepository.findActivePublicLeagueByDivision(division)
    if (!league) {
      return { status: 'NO_ACTIVE_PUBLIC_LEAGUE' }
    }

    try {
      await leagueRepository.addMember(league.id, userId)
      return { status: 'ENROLLED', leagueId: league.id }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      const isAlreadyMember =
        code === 'P2002' ||
        (err instanceof LeagueError && err.code === LEAGUE_ERRORS.ALREADY_MEMBER.code)

      if (isAlreadyMember) {
        return { status: 'ALREADY_MEMBER', leagueId: league.id }
      }

      const reason = err instanceof Error ? err.message : 'Erro desconhecido ao inscrever em liga pública'
      console.error('[LeagueAutoEnrollService] Falha ao inscrever usuário em liga pública:', err)
      return { status: 'FAILED', reason }
    }
  }
}

export const leagueAutoEnrollService = new LeagueAutoEnrollService()
