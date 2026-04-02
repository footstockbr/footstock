// module-20: ScoringJobService — Vercel Cron 1h (recálculo de scores de todas as ligas ativas)

import { prisma } from '@/lib/prisma'
import { ScoringEngine } from './ScoringEngine'
import { notificationService } from './NotificationService'

// Quiet hours BRT (UTC-3): 23h-7h → UTC 02h-10h
function isQuietHoursBRT(): boolean {
  const nowUTC = new Date()
  const brtHour = (nowUTC.getUTCHours() - 3 + 24) % 24
  return brtHour >= 23 || brtHour < 7
}

export interface CronJobResult {
  processed: number
  errors: number
  timestamp: string
}

export class ScoringJobService {
  private engine = new ScoringEngine()

  async recalcularTodasLigas(): Promise<CronJobResult> {
    const ligas = await prisma.league.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        division: true,
        endsAt: true,
        name: true,
        createdBy: true,
        members: {
          select: { userId: true },
        },
      },
    })

    if (!ligas.length) {
      return { processed: 0, errors: 0, timestamp: new Date().toISOString() }
    }

    let processed = 0
    let errors = 0

    for (const liga of ligas) {
      // ── Recalcular scores de todos os membros ─────────────────────────────
      const results = await Promise.allSettled(
        liga.members.map(async (m) => {
          const score = await this.engine.calcularScore(m.userId, liga.id)
          await this.engine.salvarScore(m.userId, liga.id, score)
        })
      )

      results.forEach((r) => {
        if (r.status === 'fulfilled') processed++
        else {
          errors++
          console.error('[ScoringJobService] Falha em membro:', r.reason)
        }
      })

      // ── Recalcular ranks após processar todos ─────────────────────────────
      try {
        await this.engine.recalcularRanks(liga.id)
      } catch (err) {
        console.error('[ScoringJobService] Falha ao recalcular ranks:', err)
      }

      // ── Detectar ligas encerradas ─────────────────────────────────────────
      if (liga.endsAt && liga.endsAt < new Date()) {
        try {
          await prisma.league.update({
            where: { id: liga.id },
            data: { status: 'FINISHED' },
          })

          // Enviar LEAGUE_RESULT para cada membro
          const inQuiet = isQuietHoursBRT()

          await Promise.allSettled(
            liga.members.map(async (m) => {
              const member = await prisma.leagueMember.findUnique({
                where: { leagueId_userId: { leagueId: liga.id, userId: m.userId } },
                select: { rank: true },
              })

              if (inQuiet) {
                // Sinalizar para envio posterior (não envia push durante quiet hours)
                console.info(
                  `[ScoringJobService] Quiet hours — LEAGUE_RESULT agendado para ${m.userId}`
                )
                return
              }

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
