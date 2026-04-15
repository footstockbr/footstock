// module-20: ScoringJobService — Vercel Cron diário às 02:00 UTC-3 (05:00 UTC)
// Schedule: "0 5 * * *" em vercel.json

import { prisma } from '@/lib/prisma'
import { leagueScoreService } from './leagues/LeagueScoreService'
import { notificationService } from './NotificationService'
import { leagueTrophyService } from './LeagueTrophyService'

export interface CronJobResult {
  processed: number
  errors: number
  timestamp: string
}

export class ScoringJobService {
  async recalcularTodasLigas(): Promise<CronJobResult> {
    const ligas = await prisma.league.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        type: true,
        name: true,
        endsAt: true,
        members: { select: { userId: true } },
      },
    })

    if (!ligas.length) {
      return { processed: 0, errors: 0, timestamp: new Date().toISOString() }
    }

    let processed = 0
    let errors = 0

    for (const liga of ligas) {
      // Pipeline completo: scores (P1-P5) → ranks → snapshot diário (alimenta P4)
      try {
        const result = await leagueScoreService.executarPipelineCompleto(liga.id)
        processed += result.processed
        errors += result.errors
      } catch (err) {
        console.error('[ScoringJobService] Falha no pipeline da liga:', liga.id, err)
        errors++
      }

      // Detecta ligas encerradas
      if (liga.endsAt && liga.endsAt < new Date()) {
        try {
          await prisma.league.update({
            where: { id: liga.id },
            data: { status: 'FINISHED' },
          })

          // Conceder troféus para ligas PRO encerradas
          if (liga.type === 'PRO') {
            await leagueTrophyService.awardTrophies(liga.id).catch((err) => {
              console.error('[ScoringJobService] Falha ao conceder troféus:', liga.id, err)
            })
          }

          await Promise.allSettled(
            liga.members.map(async (m) => {
              const member = await prisma.leagueMember.findUnique({
                where: { leagueId_userId: { leagueId: liga.id, userId: m.userId } },
                select: { rank: true },
              })

              await notificationService.sendNotification({
                userId: m.userId,
                type: 'LEAGUE_RESULT',
                title: `Liga "${liga.name}" encerrada!`,
                body: member?.rank
                  ? `Você terminou em ${member.rank}º lugar. Parabéns!`
                  : 'A liga foi encerrada. Confira seu resultado!',
                metadata: {
                  leagueId: liga.id,
                  leagueName: liga.name,
                  finalRank: member?.rank ?? null,
                  type: 'LEAGUE_ENDED',
                },
              })
            })
          )
        } catch (err) {
          console.error('[ScoringJobService] Falha ao encerrar liga:', liga.id, err)
          errors++
        }
      }
    }

    return { processed, errors, timestamp: new Date().toISOString() }
  }
}

export const scoringJobService = new ScoringJobService()
