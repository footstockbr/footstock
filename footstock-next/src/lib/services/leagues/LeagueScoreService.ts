import 'server-only'

import { prisma } from '@/lib/prisma'
import type { ScoreBreakdown } from '@/types'
import { leagueP1RiskReturnService } from './LeagueP1RiskReturnService'
import { leagueP2OperationalService } from './LeagueP2OperationalService'
import { leagueP3DiversityService } from './LeagueP3DiversityService'
import { leagueP4ConsistencyService } from './LeagueP4ConsistencyService'
import { leagueP5EducationalService } from './LeagueP5EducationalService'
import { leagueRankingService } from './LeagueRankingService'

export interface LeagueScoreResult {
  userId: string
  breakdown: ScoreBreakdown
}

function buildBreakdown(
  p1: number,
  p2: number,
  p3: number,
  p4: number,
  p5: number
): ScoreBreakdown {
  const total = p1 + p2 + p3 + p4 + p5
  return {
    rentabilidade: p1,
    sofisticacao: p2,
    diversificacao: p3,
    consistencia: p4,
    bonusEducativo: p5,
    total,
    finalScore: total,
    fatorEquidade: 1,
    equityFactorApplied: false,
  }
}

/**
 * LeagueScoreService — orquestrador dos 5 pilares de scoring.
 *
 * Pipeline correto (sem circularidade em P4):
 * 1. Calcula P1, P2, P3, P5 em paralelo
 * 2. Salva scores parciais + recalcula ranks
 * 3. Captura snapshot diário (P4 usa histórico até ontem)
 * 4. Calcula P4 com base nos snapshots existentes (inclui hoje após passo 3)
 * 5. Salva scores finais + recalcula ranks finais
 */
export class LeagueScoreService {
  async calcularParaLiga(leagueId: string): Promise<LeagueScoreResult[]> {
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      select: { userId: true },
    })
    if (members.length === 0) return []

    const memberIds = members.map((m) => m.userId)

    // Fase 1: P1, P2, P3, P5 em paralelo
    const [p1Map, p2Map, p3Map, p5Map] = await Promise.all([
      leagueP1RiskReturnService.calcularParaLiga(leagueId, memberIds).catch(() => new Map<string, number>()),
      leagueP2OperationalService.calcularParaLiga(leagueId, memberIds).catch(() => new Map<string, number>()),
      leagueP3DiversityService.calcularParaLiga(leagueId, memberIds).catch(() => new Map<string, number>()),
      leagueP5EducationalService.calcularParaLiga(leagueId, memberIds).catch(() => new Map<string, number>()),
    ])

    // Fase 2: salva scores parciais (sem P4) e recalcula ranks
    await Promise.allSettled(
      memberIds.map((userId) => {
        const p1 = p1Map.get(userId) ?? 0
        const p2 = p2Map.get(userId) ?? 0
        const p3 = p3Map.get(userId) ?? 0
        const p5 = p5Map.get(userId) ?? 0
        const partialTotal = p1 + p2 + p3 + p5
        return prisma.leagueMember.update({
          where: { leagueId_userId: { leagueId, userId } },
          data: { score: partialTotal },
        })
      })
    )
    await leagueRankingService.recalcularRanks(leagueId).catch(() => {})

    // Fase 3: captura snapshot do dia (ranks baseados em P1+P2+P3+P5)
    await leagueRankingService.capturarSnapshotDiario(leagueId).catch(() => {})

    // Fase 4: calcula P4 usando snapshots (inclui o de hoje)
    const p4Map = await leagueP4ConsistencyService.calcularParaLiga(leagueId).catch(() => new Map<string, number>())

    // Fase 5: salva scores finais com P4 incluído
    const results: LeagueScoreResult[] = []
    await Promise.allSettled(
      memberIds.map(async (userId) => {
        const p1 = p1Map.get(userId) ?? 0
        const p2 = p2Map.get(userId) ?? 0
        const p3 = p3Map.get(userId) ?? 0
        const p4 = p4Map.get(userId) ?? 0
        const p5 = p5Map.get(userId) ?? 0
        const breakdown = buildBreakdown(p1, p2, p3, p4, p5)

        await prisma.leagueMember.update({
          where: { leagueId_userId: { leagueId, userId } },
          data: {
            score: breakdown.total,
            scoreBreakdown: breakdown as unknown as import('@prisma/client').Prisma.InputJsonValue,
            lastScoreAt: new Date(),
          },
        })
        results.push({ userId, breakdown })
      })
    )

    // Recalcula ranks finais com P4 incluído
    await leagueRankingService.recalcularRanks(leagueId).catch(() => {})

    return results
  }

  async calcularParaUsuario(leagueId: string, userId: string): Promise<ScoreBreakdown> {
    const memberIds = [userId]

    const [p1Map, p2Map, p3Map, p5Map] = await Promise.all([
      leagueP1RiskReturnService.calcularParaLiga(leagueId, memberIds).catch(() => new Map<string, number>()),
      leagueP2OperationalService.calcularParaLiga(leagueId, memberIds).catch(() => new Map<string, number>()),
      leagueP3DiversityService.calcularParaLiga(leagueId, memberIds).catch(() => new Map<string, number>()),
      leagueP5EducationalService.calcularParaLiga(leagueId, memberIds).catch(() => new Map<string, number>()),
    ])
    const p4Map = await leagueP4ConsistencyService.calcularParaLiga(leagueId).catch(() => new Map<string, number>())

    const breakdown = buildBreakdown(
      p1Map.get(userId) ?? 0,
      p2Map.get(userId) ?? 0,
      p3Map.get(userId) ?? 0,
      p4Map.get(userId) ?? 0,
      p5Map.get(userId) ?? 0
    )

    await prisma.leagueMember.update({
      where: { leagueId_userId: { leagueId, userId } },
      data: {
        score: breakdown.total,
        scoreBreakdown: breakdown as unknown as import('@prisma/client').Prisma.InputJsonValue,
        lastScoreAt: new Date(),
      },
    })

    return breakdown
  }

  async executarPipelineCompleto(leagueId: string): Promise<{ processed: number; errors: number }> {
    let errors = 0

    try {
      await this.calcularParaLiga(leagueId)
    } catch (err) {
      console.error('[LeagueScoreService] Falha no pipeline:', leagueId, err)
      errors++
    }

    const members = await prisma.leagueMember.count({ where: { leagueId } })
    return { processed: members, errors }
  }
}

export const leagueScoreService = new LeagueScoreService()
