// module-20: LeagueAutoEnrollService — inscrição automática em ligas públicas
// Chamado ao concluir onboarding (tourCompleted = true) e ao fazer upgrade de plano.
// Operação best-effort: falha silenciosa se não houver liga ativa para a divisão.

import { prisma } from '@/lib/prisma'
import { LeagueError, LEAGUE_ERRORS } from '@/lib/errors/leagueErrors'
import type { PlanType } from '@/types'

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
   * Seguro para chamar múltiplas vezes (idempotente — ALREADY_MEMBER é ignorado).
   *
   * Regras:
   * - Busca a liga PUBLICA mais recente com status ACTIVE para a divisão
   * - Se não houver liga ativa, retorna sem erro (não quebra o fluxo principal)
   * - Se já for membro, retorna silenciosamente
   */
  async enrollUserInPublicLeague(userId: string, planType: PlanType): Promise<void> {
    const division = this.getDivisionForPlan(planType)

    const league = await prisma.league.findFirst({
      where: { type: 'PUBLICA', division, status: 'ACTIVE' },
      orderBy: { startsAt: 'desc' },
      select: { id: true, maxMembers: true, _count: { select: { members: true } } },
    })

    if (!league) {
      // Nenhuma liga pública ativa para esta divisão — skip silencioso
      return
    }

    if (league._count.members >= league.maxMembers) {
      // Liga cheia — skip silencioso
      return
    }

    try {
      await prisma.leagueMember.create({
        data: { leagueId: league.id, userId, joinedAt: new Date() },
      })
    } catch (err: unknown) {
      // P2002 = unique constraint (já é membro) — idempotente
      if ((err as { code?: string })?.code === 'P2002') return
      if (err instanceof LeagueError && err.code === LEAGUE_ERRORS.ALREADY_MEMBER.code) return
      // Qualquer outro erro: log e silencia para não quebrar fluxo principal
      console.error('[LeagueAutoEnrollService] Falha ao inscrever usuário em liga pública:', err)
    }
  }
}

export const leagueAutoEnrollService = new LeagueAutoEnrollService()
