import 'server-only'

import { prisma } from '@/lib/prisma'

const MAX_P4 = 15

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

/**
 * Pilar P4 — Consistency (max 15 pts).
 *
 * Fórmula: (1 - (avg_daily_rank_position - 1) / (total_members - 1)) * 15
 * - Usa snapshots diários de league_daily_ranks
 * - Considera apenas dias desde o joinedAt do usuário
 * - Empate: membros com mesmo score compartilham posição (média das posições)
 * - Liga com 1 membro: P4 = 15
 * - Fallback para rank atual se não há histórico
 */
export class LeagueP4ConsistencyService {
  async calcularParaLiga(leagueId: string): Promise<Map<string, number>> {
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      select: { userId: true, joinedAt: true, rank: true },
    })

    if (members.length === 0) return new Map()
    if (members.length === 1) return new Map([[members[0]!.userId, MAX_P4]])

    const totalMembers = members.length
    const joinedAtByUser = new Map(
      members.map((m) => [m.userId, utcDay(m.joinedAt)])
    )
    const currentRankByUser = new Map(
      members.map((m) => [m.userId, m.rank > 0 ? m.rank : totalMembers])
    )
    const memberIds = members.map((m) => m.userId)

    // Busca snapshots diários
    const snapshots = await prisma.leagueDailyRank.findMany({
      where: { leagueId, userId: { in: memberIds } },
      select: { userId: true, date: true, rank: true },
      orderBy: [{ date: 'asc' }, { userId: 'asc' }],
    })

    // Filtra snapshots por joinedAt do usuário
    const ranksByUser = new Map<string, number[]>()
    for (const snap of snapshots) {
      const joinedAt = joinedAtByUser.get(snap.userId)
      if (!joinedAt) continue
      const snapDay = utcDay(snap.date)
      if (snapDay.getTime() < joinedAt.getTime()) continue

      const arr = ranksByUser.get(snap.userId) ?? []
      arr.push(snap.rank)
      ranksByUser.set(snap.userId, arr)
    }

    const scores = new Map<string, number>()

    for (const member of members) {
      const ranks = ranksByUser.get(member.userId) ?? []

      // Se sem histórico, usa rank atual como aproximação
      const avgRank = ranks.length > 0
        ? mean(ranks)
        : (currentRankByUser.get(member.userId) ?? totalMembers)

      const normalized = 1 - ((avgRank - 1) / (totalMembers - 1))
      const p4 = round2(Math.max(0, Math.min(normalized * MAX_P4, MAX_P4)))
      scores.set(member.userId, p4)
    }

    return scores
  }
}

export const leagueP4ConsistencyService = new LeagueP4ConsistencyService()
