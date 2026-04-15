// ============================================================================
// Foot Stock — LeagueTrophyService
// Concessão de troféus virtuais ao encerrar ligas PRO.
// Troféus são puramente cosméticos — valor monetário zero.
// Fonte: T-017
// ============================================================================

import { prisma } from '@/lib/prisma'

export class LeagueTrophyService {
  /**
   * Concede troféus para os top 3 de uma liga PRO encerrada.
   * Idempotente: se troféus já existem para esta liga, não reprocessa.
   * Empate: ambos recebem o troféu da posição compartilhada.
   *   Ex: 2 usuários empatam em 2o → ambos recebem RUNNER_UP, próximo fica sem THIRD.
   */
  async awardTrophies(leagueId: string): Promise<void> {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, type: true, status: true },
    })

    if (!league || league.type !== 'PRO') return
    if (league.status !== 'FINISHED') return

    // Idempotência: verificar se já foi processado
    const existing = await prisma.leagueTrophy.count({ where: { leagueId } })
    if (existing > 0) return

    // Buscar membros ordenados por score desc, joinedAt asc (desempate por entrada antecipada)
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
      select: { userId: true, score: true, rank: true },
    })

    if (members.length === 0) return

    // Calcular troféus com lógica de empate
    type TrophyEntry = {
      userId: string
      trophyType: 'PRO_LEAGUE_WINNER' | 'PRO_LEAGUE_RUNNER_UP' | 'PRO_LEAGUE_THIRD'
      position: number
    }

    const trophies: TrophyEntry[] = []
    const trophyMap: Record<number, TrophyEntry['trophyType']> = {
      1: 'PRO_LEAGUE_WINNER',
      2: 'PRO_LEAGUE_RUNNER_UP',
      3: 'PRO_LEAGUE_THIRD',
    }

    // Agrupar por score para detectar empates
    const scoreGroups: { score: string; userIds: string[] }[] = []
    for (const m of members) {
      const scoreStr = m.score.toString()
      const last = scoreGroups[scoreGroups.length - 1]
      if (last && last.score === scoreStr) {
        last.userIds.push(m.userId)
      } else {
        scoreGroups.push({ score: scoreStr, userIds: [m.userId] })
      }
    }

    let position = 1
    for (const group of scoreGroups) {
      if (position > 3) break

      const trophyType = trophyMap[position]
      if (!trophyType) break

      for (const userId of group.userIds) {
        trophies.push({ userId, trophyType, position })
      }

      // Se empate em posição 1 ou 2 com >1 usuário, avança mais de uma posição
      // (ex: 2 empatam em 1o → próximo começa em 3o)
      position += group.userIds.length
    }

    if (trophies.length === 0) return

    await prisma.leagueTrophy.createMany({
      data: trophies.map((t) => ({
        userId: t.userId,
        leagueId,
        trophyType: t.trophyType,
        position: t.position,
      })),
      skipDuplicates: true,
    })
  }
}

export const leagueTrophyService = new LeagueTrophyService()
