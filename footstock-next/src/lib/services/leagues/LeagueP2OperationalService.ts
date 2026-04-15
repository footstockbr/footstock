import 'server-only'

import { prisma } from '@/lib/prisma'

// Pontos por tipo de evento P2
const P2_POINTS: Record<string, number> = {
  LIMIT_ORDER_USED: 4,
  OCO_ORDER_USED: 6,
  SHORT_PROFITABLE_CLOSED: 8,
  SCHEDULED_ORDER_USED: 3,
  AI_ASSESSOR_CONSULTED: 2,
  GLOSSARY_5_TERMS: 2,
}

const MAX_P2 = 25

/**
 * Pilar P2 — Operational Sophistication (max 25 pts).
 * Soma pontos dos eventos registrados em league_score_events.
 * Cap em 25 pts por usuário.
 */
export class LeagueP2OperationalService {
  async calcularParaLiga(
    leagueId: string,
    memberIds: string[]
  ): Promise<Map<string, number>> {
    if (memberIds.length === 0) return new Map()

    const events = await prisma.leagueScoreEvent.findMany({
      where: {
        leagueId,
        userId: { in: memberIds },
        eventType: { in: Object.keys(P2_POINTS) },
      },
      select: { userId: true, eventType: true, points: true },
    })

    const totals = new Map<string, number>(memberIds.map((id) => [id, 0]))

    for (const event of events) {
      const current = totals.get(event.userId) ?? 0
      const pts = event.points > 0 ? event.points : (P2_POINTS[event.eventType] ?? 0)
      totals.set(event.userId, current + pts)
    }

    // Aplica cap
    for (const [userId, total] of totals) {
      totals.set(userId, Math.min(total, MAX_P2))
    }

    return totals
  }

  /**
   * Retorna detalhe dos eventos P2 de um usuário específico (para exibição no frontend).
   */
  async detalheEventos(
    leagueId: string,
    userId: string
  ): Promise<{ eventType: string; points: number; period: string }[]> {
    const events = await prisma.leagueScoreEvent.findMany({
      where: {
        leagueId,
        userId,
        eventType: { in: Object.keys(P2_POINTS) },
      },
      select: { eventType: true, points: true, period: true },
      orderBy: { createdAt: 'desc' },
    })

    return events.map((e) => ({
      eventType: e.eventType,
      points: e.points,
      period: e.period,
    }))
  }
}

export const leagueP2OperationalService = new LeagueP2OperationalService()
