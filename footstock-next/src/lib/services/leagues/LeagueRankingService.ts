import 'server-only'

import { prisma } from '@/lib/prisma'

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Gerencia rankings de ligas:
 * - Recalcula ranks atuais dos membros (persiste em LeagueMember.rank)
 * - Captura snapshot diário em LeagueDailyRank (alimenta P4)
 *
 * Empate: membros com mesmo score recebem a mesma posição (dense rank).
 */
export class LeagueRankingService {
  /**
   * Recalcula rank atual de todos os membros da liga.
   * Desempate: joinedAt ASC (quem entrou primeiro fica melhor).
   */
  async recalcularRanks(leagueId: string): Promise<void> {
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
      select: { id: true, score: true },
    })

    // Dense rank: membros com mesmo score recebem a mesma posição
    // Ex: 100, 100, 80 → rank 1, 1, 2 (não 1, 1, 3)
    let rank = 1
    for (let i = 0; i < members.length; i++) {
      if (i > 0 && members[i]!.score.toString() !== members[i - 1]!.score.toString()) {
        rank++
      }
      await prisma.leagueMember.update({
        where: { id: members[i]!.id },
        data: { rank },
      })
    }
  }

  /**
   * Captura snapshot diário dos ranks e scores atuais de todos os membros.
   * Idempotente: usa upsert por (leagueId, userId, date).
   */
  async capturarSnapshotDiario(leagueId: string): Promise<void> {
    const today = utcDay(new Date())

    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      select: { userId: true, rank: true, score: true },
    })

    if (members.length === 0) return

    await Promise.allSettled(
      members.map((m) =>
        prisma.leagueDailyRank.upsert({
          where: {
            leagueId_userId_date: {
              leagueId,
              userId: m.userId,
              date: today,
            },
          },
          update: { rank: m.rank, score: m.score },
          create: {
            leagueId,
            userId: m.userId,
            date: today,
            rank: m.rank,
            score: m.score,
          },
        })
      )
    )
  }

  /**
   * Retorna histórico de posições diárias de um usuário em uma liga.
   */
  async historicoPosicoes(
    leagueId: string,
    userId: string
  ): Promise<{ date: string; rank: number; score: number }[]> {
    const rows = await prisma.leagueDailyRank.findMany({
      where: { leagueId, userId },
      orderBy: { date: 'asc' },
      select: { date: true, rank: true, score: true },
    })

    return rows.map((r) => ({
      date: r.date.toISOString().slice(0, 10),
      rank: r.rank,
      score: Number(r.score),
    }))
  }
}

export const leagueRankingService = new LeagueRankingService()
