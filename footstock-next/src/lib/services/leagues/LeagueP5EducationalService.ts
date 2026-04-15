import 'server-only'

import { prisma } from '@/lib/prisma'

const P5_POINTS: Record<string, number> = {
  FORUM_POST_LIKED: 2,
  GLOSSARY_3_CATEGORIES: 1,
  PLAN_UPGRADED: 2,
}

const MAX_P5 = 5

/**
 * Pilar P5 — Educational Bonus (max 5 pts).
 *
 * Eventos únicos por liga (period = 'league'):
 * - FORUM_POST_LIKED: +2 pts
 * - GLOSSARY_3_CATEGORIES: +1 pt
 * - PLAN_UPGRADED: +2 pts
 */
export class LeagueP5EducationalService {
  async calcularParaLiga(
    leagueId: string,
    memberIds: string[]
  ): Promise<Map<string, number>> {
    if (memberIds.length === 0) return new Map()

    const events = await prisma.leagueScoreEvent.findMany({
      where: {
        leagueId,
        userId: { in: memberIds },
        eventType: { in: Object.keys(P5_POINTS) },
        period: 'league',
      },
      select: { userId: true, eventType: true, points: true },
    })

    const totals = new Map<string, number>(memberIds.map((id) => [id, 0]))

    for (const event of events) {
      const current = totals.get(event.userId) ?? 0
      const pts = event.points > 0 ? event.points : (P5_POINTS[event.eventType] ?? 0)
      totals.set(event.userId, current + pts)
    }

    // Aplica cap
    for (const [userId, total] of totals) {
      totals.set(userId, Math.min(total, MAX_P5))
    }

    return totals
  }
}

export const leagueP5EducationalService = new LeagueP5EducationalService()
