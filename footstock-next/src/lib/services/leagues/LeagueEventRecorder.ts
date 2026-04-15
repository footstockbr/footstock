import 'server-only'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type LeagueEventType =
  | 'LIMIT_ORDER_USED'
  | 'OCO_ORDER_USED'
  | 'SCHEDULED_ORDER_USED'
  | 'AI_ASSESSOR_CONSULTED'
  | 'SHORT_PROFITABLE_CLOSED'
  | 'GLOSSARY_5_TERMS'
  | 'FORUM_POST_LIKED'
  | 'GLOSSARY_3_CATEGORIES'
  | 'PLAN_UPGRADED'

export interface LeagueEvent {
  leagueId: string
  userId: string
  eventType: LeagueEventType
  metadata?: Prisma.InputJsonValue
  occurredAt?: Date
}

// Pontos por tipo de evento
const EVENT_POINTS: Record<LeagueEventType, number> = {
  LIMIT_ORDER_USED: 4,
  OCO_ORDER_USED: 6,
  SCHEDULED_ORDER_USED: 3,
  AI_ASSESSOR_CONSULTED: 2,
  SHORT_PROFITABLE_CLOSED: 8,
  GLOSSARY_5_TERMS: 2,
  FORUM_POST_LIKED: 2,
  GLOSSARY_3_CATEGORIES: 1,
  PLAN_UPGRADED: 2,
}

// Eventos com deduplicação diária (period = YYYY-MM-DD)
const DAILY_DEDUP_EVENTS = new Set<LeagueEventType>([
  'LIMIT_ORDER_USED',
  'OCO_ORDER_USED',
  'SCHEDULED_ORDER_USED',
  'AI_ASSESSOR_CONSULTED',
])

// Eventos únicos por liga (period = 'league')
const LEAGUE_UNIQUE_EVENTS = new Set<LeagueEventType>([
  'GLOSSARY_5_TERMS',
  'FORUM_POST_LIKED',
  'GLOSSARY_3_CATEGORIES',
  'PLAN_UPGRADED',
])

function resolvePeriod(eventType: LeagueEventType, occurredAt: Date): string {
  if (DAILY_DEDUP_EVENTS.has(eventType)) {
    return occurredAt.toISOString().slice(0, 10) // YYYY-MM-DD
  }
  if (LEAGUE_UNIQUE_EVENTS.has(eventType)) {
    return 'league'
  }
  // SHORT_PROFITABLE_CLOSED: period único via ISO timestamp → sem dedup
  return occurredAt.toISOString()
}

export class LeagueEventRecorder {
  async record(event: LeagueEvent): Promise<void> {
    const occurredAt = event.occurredAt ?? new Date()
    const period = resolvePeriod(event.eventType, occurredAt)
    const points = EVENT_POINTS[event.eventType] ?? 0

    // SHORT_PROFITABLE_CLOSED: create direto (period único, nunca conflita)
    if (event.eventType === 'SHORT_PROFITABLE_CLOSED') {
      await prisma.leagueScoreEvent.create({
        data: {
          leagueId: event.leagueId,
          userId: event.userId,
          eventType: event.eventType,
          points,
          period,
          metadata: event.metadata,
        },
      })
      return
    }

    // Demais tipos: upsert idempotente via unique constraint
    await prisma.leagueScoreEvent.upsert({
      where: {
        leagueId_userId_eventType_period: {
          leagueId: event.leagueId,
          userId: event.userId,
          eventType: event.eventType,
          period,
        },
      },
      update: {},
      create: {
        leagueId: event.leagueId,
        userId: event.userId,
        eventType: event.eventType,
        points,
        period,
        metadata: event.metadata,
      },
    })
  }

  /**
   * Registra evento para todas as ligas ACTIVE do usuário.
   * Ignora silenciosamente falhas individuais.
   */
  async recordForAllActiveLeagues(
    userId: string,
    eventType: LeagueEventType,
    metadata?: Prisma.InputJsonValue
  ): Promise<void> {
    const memberships = await prisma.leagueMember.findMany({
      where: { userId, league: { status: 'ACTIVE' } },
      select: { leagueId: true },
    })
    if (memberships.length === 0) return

    await Promise.allSettled(
      memberships.map(({ leagueId }) =>
        this.record({ leagueId, userId, eventType, metadata })
      )
    )
  }
}

export const leagueEventRecorder = new LeagueEventRecorder()
