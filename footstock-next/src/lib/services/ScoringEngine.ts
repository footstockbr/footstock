// module-20: ScoringEngine — 5 pilares de pontuação + fator de equidade
// CONTRATO CROSS-ROCK: consumers module-14, module-15, module-18

import { prisma } from '@/lib/prisma'
import type { LeagueCategory, ScoreBreakdown } from '@/types'
import type { ScoringContract, TradingDataForScoring } from '@/lib/contracts/scoring-contract'

// ─── Constantes dos pilares ────────────────────────────────────────────────────

const MAX_RENTABILIDADE = 35
const MAX_SOFISTICACAO = 25
const MAX_DIVERSIFICACAO = 20
const MAX_CONSISTENCIA = 15
const MAX_BONUS_EDUCATIVO = 5

// Fator de equidade na liga OPEN — aplicado SOMENTE ao Pilar 1 (rentabilidade).
// Compensa assimetria de informação e saldo entre planos.
// Configurável via env vars para ajustes em beta sem redeploy.
function parseEnvFactor(raw: string | undefined, fallback: number): number {
  const n = Number(raw)
  return isNaN(n) || n <= 0 ? fallback : n
}

const EQUITY_FACTOR_OPEN: Record<string, number> = {
  JOGADOR: parseEnvFactor(process.env.EQUITY_FACTOR_JOGADOR, 1.40),
  CRAQUE:  parseEnvFactor(process.env.EQUITY_FACTOR_CRAQUE,  1.15),
  LENDA:   parseEnvFactor(process.env.EQUITY_FACTOR_LENDA,   1.0),
}

// ─── Funções auxiliares ────────────────────────────────────────────────────────

/**
 * Índice de Herfindahl-Hirschman — concentração de portfólio.
 * Retorna 1.0 quando há concentração total (= Diversificação 0 pts).
 */
function herfindahl(positions: { value: number }[]): number {
  if (!positions.length) return 1
  const total = positions.reduce((sum, p) => sum + p.value, 0)
  if (total === 0) return 1
  return positions.reduce((sum, p) => sum + Math.pow(p.value / total, 2), 0)
}

/** Média aritmética */
function mean(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** Desvio padrão populacional */
function stdDev(values: number[], avg: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length
  return Math.sqrt(variance)
}

// ─── ScoringEngine ─────────────────────────────────────────────────────────────

export class ScoringEngine implements ScoringContract {
  /**
   * Coleta todos os dados de trading necessários para o score.
   * Falhas de providers externos → modo degradado (0 para o pilar afetado).
   */
  async getTradingData(
    userId: string,
    leagueId: string,
    since: Date
  ): Promise<TradingDataForScoring> {
    // ── Provider module-15: P&L e posições ──────────────────────────────────
    let pnLPercent = 0
    let positions: { ticker: string; value: number }[] = []
    let dailyReturns: number[] = []

    try {
      const rawPositions = await prisma.position.findMany({
        where: { userId, status: 'OPEN' },
        select: {
          assetId: true, quantity: true, avgPrice: true,
          asset: { select: { division: true } },
        },
      })

      let totalValue = 0
      let totalCost = 0
      positions = rawPositions.map((p) => {
        const value = Number(p.quantity) * Number(p.avgPrice)
        totalValue += value
        totalCost += value
        return { ticker: p.assetId, value, division: p.asset?.division ?? undefined }
      })

      pnLPercent = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0

      const snapshots = await prisma.priceHistory.findMany({
        where: {
          assetId: { in: rawPositions.map((p) => p.assetId) },
        },
        orderBy: { timestamp: 'asc' },
        take: 30,
      })
      if (snapshots.length > 1) {
        dailyReturns = snapshots.slice(1).map((s, i) => {
          const prev = Number(snapshots[i].close)
          const curr = Number(s.close)
          return prev > 0 ? (curr - prev) / prev : 0
        })
      }
    } catch (err) {
      console.error('[ScoringEngine] Falha ao buscar dados de portfólio (module-15):', err)
    }

    // ── Provider module-14: ordens ──────────────────────────────────────────
    let totalOrders = 0
    let advancedOrders = 0

    try {
      const orders = await prisma.order.findMany({
        where: {
          userId,
          createdAt: { gte: since },
          status: { in: ['FILLED', 'PARTIAL'] },
        },
        select: { type: true, side: true },
      })

      totalOrders = orders.length
      advancedOrders = orders.filter(
        (o) => o.type === 'LIMIT' || o.type === 'OCO' || o.side === 'SELL'
      ).length
    } catch (err) {
      console.error('[ScoringEngine] Falha ao buscar ordens (module-14):', err)
    }

    // ── Provider module-18: interações com glossário ────────────────────────
    let glossaryInteractions = 0

    try {
      glossaryInteractions = await prisma.glossaryInteraction.count({
        where: {
          userId,
          createdAt: { gte: since },
        },
      })
    } catch (err) {
      console.error('[ScoringEngine] Falha ao buscar glossaryInteractions (module-18):', err)
    }

    return { pnLPercent, totalOrders, advancedOrders, positions, dailyReturns, glossaryInteractions }
  }

  /**
   * Fator de equidade para liga OPEN baseado no plano do usuário.
   * BRONZE/PRATA/OURO não aplicam fator (retorna 1.0).
   */
  getEquityFactorForPlan(planType: string): number {
    return EQUITY_FACTOR_OPEN[planType] ?? 1.0
  }

  /**
   * Calcula o score completo do usuário em uma liga.
   * Nunca lança exceção — retorna zeros em caso de falha total.
   *
   * Pilar 2 — Pontuação aditiva por tipo de evento:
   *   LIMIT_ORDER_USED: +4, OCO_ORDER_USED: +6, SHORT_PROFITABLE_CLOSED: +8,
   *   SCHEDULED_ORDER_USED: +3, AI_ASSESSOR_CONSULTED: +2, GLOSSARY_5_TERMS: +2
   *
   * Pilar 5 — Bônus Educativo aditivo:
   *   FORUM_POST_LIKED: +2, GLOSSARY_3_CATEGORIES: +1, PLAN_UPGRADED: +2
   */
  async calcularScore(userId: string, leagueId: string): Promise<ScoreBreakdown> {
    try {
      const league = await prisma.league.findUnique({
        where: { id: leagueId },
        select: { division: true, startsAt: true },
      })

      if (!league) {
        return this._zeroScore(1.0)
      }

      const data = await this.getTradingData(userId, leagueId, league.startsAt)

      // Equity factor: somente ligas OPEN, baseado no plano ATUAL do usuário.
      // Plano muda a partir do dia seguinte — o cron diário recalcula automaticamente.
      const isOpenLeague = league.division === 'OPEN'
      let fatorEquidade = 1.0
      if (isOpenLeague) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { planType: true },
          })
          fatorEquidade = this.getEquityFactorForPlan(user?.planType ?? 'JOGADOR')
        } catch (err) {
          console.error('[ScoringEngine] Falha ao buscar planType para equity factor:', err)
          // Modo degradado: fator neutro (sem boost)
          fatorEquidade = 1.0
        }
      }

      // ── Buscar eventos de scoring (Pilar 2 e 5) ──────────────────────────
      let scoreEvents: { eventType: string; points: number }[] = []
      try {
        scoreEvents = await prisma.leagueScoreEvent.findMany({
          where: { leagueId, userId, createdAt: { gte: league.startsAt } },
          select: { eventType: true, points: true },
        })
      } catch {
        // Modo degradado: sem eventos, pilares 2 e 5 ficam em 0
      }

      // Pilar 1 — Rentabilidade Ajustada ao Risco (0-35)
      // Sharpe simplificado: (retorno - retorno_média) / volatilidade
      let rentabilidade = 0
      if (data.dailyReturns.length >= 2) {
        const avg = mean(data.dailyReturns)
        const sd = stdDev(data.dailyReturns, avg)
        if (sd > 0) {
          const sharpe = avg / sd
          rentabilidade = Math.max(0, Math.min(sharpe * MAX_RENTABILIDADE, MAX_RENTABILIDADE))
        } else if (avg > 0) {
          rentabilidade = MAX_RENTABILIDADE // Retorno positivo sem volatilidade
        }
      } else if (data.pnLPercent > 0) {
        // Fallback: P&L linear quando não há retornos diários suficientes
        rentabilidade = Math.max(0, Math.min((data.pnLPercent / 100) * MAX_RENTABILIDADE, MAX_RENTABILIDADE))
      }

      // Pilar 2 — Sofisticação Operacional (0-25) — pontuação aditiva por evento
      const PILAR2_POINTS: Record<string, number> = {
        LIMIT_ORDER_USED: 4,
        OCO_ORDER_USED: 6,
        SHORT_PROFITABLE_CLOSED: 8,
        SCHEDULED_ORDER_USED: 3,
        AI_ASSESSOR_CONSULTED: 2,
        GLOSSARY_5_TERMS: 2,
      }

      let sofisticacaoRaw = 0
      for (const event of scoreEvents) {
        const pts = PILAR2_POINTS[event.eventType]
        if (pts !== undefined) {
          sofisticacaoRaw += event.points > 0 ? event.points : pts
        }
      }
      const sofisticacao = Math.min(sofisticacaoRaw, MAX_SOFISTICACAO)

      // Pilar 3 — Diversificação da Carteira (0-20)
      // min(20, ativos_únicos × 3 + bônus Série A+B)
      const uniqueAssets = new Set(data.positions.map(p => p.ticker)).size
      let diversificacaoRaw = uniqueAssets * 3
      // Bônus +4 se tem ativos de AMBAS as divisões (SERIE_A e SERIE_B)
      const divisions = new Set(data.positions.map(p => p.division).filter(Boolean))
      if (divisions.has('SERIE_A') && divisions.has('SERIE_B')) diversificacaoRaw += 4
      const diversificacao = Math.min(diversificacaoRaw, MAX_DIVERSIFICACAO)

      // Pilar 4 — Consistência ao Longo da Liga (0-15)
      // Estabilidade no ranking (desincentiva all-in de último dia)
      let consistencia = 0
      if (data.dailyReturns.length >= 2) {
        const avg = mean(data.dailyReturns)
        const sd = stdDev(data.dailyReturns, avg)
        if (sd > 0) {
          // Quanto menor a volatilidade com retorno positivo, maior a consistência
          const consistency = avg >= 0 ? Math.max(0, 1 - sd) : Math.max(0, 0.5 - sd)
          consistencia = Math.min(consistency * MAX_CONSISTENCIA, MAX_CONSISTENCIA)
          consistencia = Math.max(0, consistencia)
        } else if (avg >= 0) {
          consistencia = MAX_CONSISTENCIA // Retorno estável sem volatilidade
        }
      }

      // Pilar 5 — Bônus Educativo (0-5) — pontuação aditiva por evento
      const PILAR5_POINTS: Record<string, number> = {
        FORUM_POST_LIKED: 2,
        GLOSSARY_3_CATEGORIES: 1,
        PLAN_UPGRADED: 2,
      }

      let bonusRaw = 0
      for (const event of scoreEvents) {
        const pts = PILAR5_POINTS[event.eventType]
        if (pts !== undefined) {
          bonusRaw += event.points > 0 ? event.points : pts
        }
      }
      const bonusEducativo = Math.min(bonusRaw, MAX_BONUS_EDUCATIVO)

      const total = rentabilidade + sofisticacao + diversificacao + consistencia + bonusEducativo

      // Equity factor aplicado SOMENTE ao Pilar 1 em ligas OPEN.
      // Outros 4 pilares não são modificados para não distorcer habilidades técnicas.
      const rentabilidadeAjustada = isOpenLeague
        ? rentabilidade * fatorEquidade
        : rentabilidade
      const finalScore = rentabilidadeAjustada + sofisticacao + diversificacao + consistencia + bonusEducativo

      return {
        rentabilidade: +rentabilidade.toFixed(4),
        sofisticacao: +sofisticacao.toFixed(4),
        diversificacao: +diversificacao.toFixed(4),
        consistencia: +consistencia.toFixed(4),
        bonusEducativo: +bonusEducativo.toFixed(4),
        total: +total.toFixed(4),
        finalScore: +finalScore.toFixed(4),
        fatorEquidade,
        equityFactorApplied: isOpenLeague,
      }
    } catch (err) {
      console.error('[ScoringEngine] Erro inesperado ao calcular score:', err)
      return this._zeroScore(1.0)
    }
  }

  /**
   * Persiste o score calculado em LeagueMember.
   */
  async salvarScore(
    userId: string,
    leagueId: string,
    score: ScoreBreakdown
  ): Promise<void> {
    await prisma.leagueMember.upsert({
      where: { leagueId_userId: { leagueId, userId } },
      update: {
        score: score.finalScore,
        scoreBreakdown: JSON.parse(JSON.stringify(score)),
        lastScoreAt: new Date(),
      },
      create: {
        leagueId,
        userId,
        score: score.finalScore,
        scoreBreakdown: JSON.parse(JSON.stringify(score)),
        joinedAt: new Date(),
        lastScoreAt: new Date(),
      },
    })
  }

  /**
   * Recalcula rankings após atualização de scores.
   * Empates desfeitos por joinedAt ASC.
   */
  async recalcularRanks(leagueId: string): Promise<void> {
    const members = await prisma.leagueMember.findMany({
      where: { leagueId },
      orderBy: [{ score: 'desc' }, { joinedAt: 'asc' }],
      select: { id: true },
    })

    await Promise.all(
      members.map((m, i) =>
        prisma.leagueMember.update({ where: { id: m.id }, data: { rank: i + 1 } })
      )
    )
  }

  private _zeroScore(fatorEquidade: number, equityFactorApplied = false): ScoreBreakdown {
    return {
      rentabilidade: 0,
      sofisticacao: 0,
      diversificacao: 0,
      consistencia: 0,
      bonusEducativo: 0,
      total: 0,
      finalScore: 0,
      fatorEquidade,
      equityFactorApplied,
    }
  }
}

export const scoringEngine = new ScoringEngine()
