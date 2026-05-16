// ============================================================================
// FootStock — DividendService (module-16)
// Orquestrador de dividendos. Mantém métodos legados (calcularDividendoEsportivo,
// calcularDividendoFinanceiro) como wrappers dos novos serviços especializados.
// Novos callers devem usar diretamente os serviços em services/dividends/.
// Rastreabilidade: INT-072, INT-073, INT-074 / T-007
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { PLAN_TYPE, IMPACT_EVENT_TYPE, DIVIDEND_TYPE, DIVIDEND_STATUS, NOTIFICATION_TYPE } from '@/lib/enums'
import type { ImpactEventType } from '@/lib/enums'
import { getWalletBalance } from '@/lib/services/WalletService'
import { sendNotification } from '@/lib/services/NotificationService'
import { dividendRepository } from '@/lib/repositories/DividendRepository'
import type { Dividend } from '@prisma/client'
import { sportingResultDividendService } from '@/lib/services/dividends/SportingResultDividendService'
import { financialPeriodicDividendService } from '@/lib/services/dividends/FinancialPeriodicDividendService'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Taxas de yield por resultado esportivo (fração sobre valorPosicao) */
const YIELD_RATES: Partial<Record<ImpactEventType, number>> = {
  [IMPACT_EVENT_TYPE.VITORIA]: 0.008,
  [IMPACT_EVENT_TYPE.TITULO]: 0.030,
  [IMPACT_EVENT_TYPE.EMPATE]: 0,
  [IMPACT_EVENT_TYPE.DERROTA]: 0,
}

const FINANCIAL_YIELD_RATE = 0.005  // 0.5% ao mês
const FINANCIAL_SENTIMENT_THRESHOLD = 0.3
// PENDING_TTL_MS removido — JOGADOR não recebe mais dividendos (INTAKE canônico)
// Pool pgBouncer ~20-25 conexões; batch ≤ floor(pool/2) para evitar starvation
const DIVIDEND_BATCH_SIZE = 10

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

interface PositionForDividend {
  userId: string
  quantity: number
  currentPrice: number
  planType: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Arredondamento financeiro com ponto fixo (evita imprecisão de float) */
function fixedRound(value: number): number {
  return Math.round(value * 100) / 100
}

/** Fator de sentimento com cap em 1.5x */
function sentimentFactor(sentiment: number): number {
  return Math.min(1 + sentiment, 1.5)
}

/** Processa lista em batches de DIVIDEND_BATCH_SIZE com Promise.allSettled */
async function processBatches<T>(
  items: T[],
  handler: (item: T) => Promise<void>
): Promise<{ processed: number; failed: number }> {
  let processed = 0
  let failed = 0

  for (let i = 0; i < items.length; i += DIVIDEND_BATCH_SIZE) {
    const batch = items.slice(i, i + DIVIDEND_BATCH_SIZE)
    const results = await Promise.allSettled(batch.map(handler))
    for (const r of results) {
      if (r.status === 'fulfilled') processed++
      else {
        failed++
        console.error('[DividendService] batch failed:', r.reason)
      }
    }
  }

  return { processed, failed }
}

/** Busca posições abertas para um ticker com preço atual e plano do usuário */
async function findPositionsByTicker(ticker: string): Promise<PositionForDividend[]> {
  const asset = await prisma.asset.findUnique({ where: { ticker } })
  if (!asset) return []

  const positions = await prisma.position.findMany({
    where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
    include: { user: { select: { planType: true } } },
  })

  return positions.map(p => ({
    userId: p.userId,
    quantity: Number(p.quantity),
    currentPrice: Number(asset.currentPrice),
    planType: p.user.planType,
  }))
}

// ---------------------------------------------------------------------------
// DividendService
// ---------------------------------------------------------------------------

export class DividendService {
  /**
   * Calcula e credita dividendo esportivo imediatamente para todos os planos.
   * VITORIA (0.8%) e TITULO (3.0%) geram crédito; EMPATE e DERROTA são ignorados.
   *
   * @param ticker  Ticker do clube (ex: "FLM")
   * @param impactCategory  Resultado da partida (VITORIA, TITULO, EMPATE, DERROTA)
   * @param sentiment  Sentimento do clube [0, 1]
   */
  async calcularDividendoEsportivo(
    ticker: string,
    impactCategory: ImpactEventType,
    sentiment: number
  ): Promise<{ processed: number; failed: number }> {
    const yieldRate = YIELD_RATES[impactCategory] ?? 0

    if (yieldRate === 0) {
      console.log(`[DividendService] ${impactCategory}: sem dividendo para ${ticker}`)
      return { processed: 0, failed: 0 }
    }

    const positions = await findPositionsByTicker(ticker)
    if (positions.length === 0) {
      console.log(`[DividendService] nenhuma posição ativa para ticker: ${ticker}`)
      return { processed: 0, failed: 0 }
    }

    // Buscar nome do clube
    const asset = await prisma.asset.findUnique({ where: { ticker } })
    const clubName = asset?.displayName ?? ticker
    const fator = sentimentFactor(sentiment)

    return processBatches(positions, async (pos) => {
      const amount = fixedRound(pos.quantity * pos.currentPrice * yieldRate * fator)
      const yieldPercent = fixedRound(yieldRate * fator * 100)

      await prisma.$transaction(async (tx) => {
        await tx.dividend.create({
          data: {
            userId: pos.userId,
            ticker,
            clubName,
            type: DIVIDEND_TYPE.ESPORTIVO,
            amount,
            yieldPercent,
            status: DIVIDEND_STATUS.CREDITED,
            triggerEvent: impactCategory,
            createdAt: new Date(),
          },
        })
        await tx.user.update({
          where: { id: pos.userId },
          data: { fsBalance: { increment: amount } },
        })
      })

      const newBalance = await getWalletBalance(pos.userId)
      await sendNotification(pos.userId, NOTIFICATION_TYPE.DIVIDEND_CREDITED, {
        title: 'Dividendo Esportivo Creditado',
        body: `Você recebeu FS$${amount} de dividendo esportivo do ${ticker}.`,
        metadata: { value: amount, ticker, dividendType: 'Esportivo', newBalance },
      })

      console.log(`[DividendService] ${impactCategory}: ${ticker} → FS$${amount} para userId=${pos.userId}`)
    })
  }

  /**
   * Calcula yield financeiro mensal de 0.5% para clubes com sentiment > 0.3.
   * Craque/Lenda: CREDITED imediato. Jogador: PENDING por 7 dias.
   *
   * @param processingMonth  Formato "YYYY-MM" — garante idempotência
   */
  async calcularDividendoFinanceiro(
    processingMonth: string
  ): Promise<{ processed: number; skipped: number }> {
    // Idempotência: verificar se mês já foi processado
    const exists = await dividendRepository.existsForMonth(processingMonth)
    if (exists) {
      console.log(`[DividendService] mês ${processingMonth} já processado (idempotência)`)
      return { processed: 0, skipped: 0 }
    }

    // Buscar ativos com sentiment > threshold via Redis (fallback DB)
    const qualifiedAssets = await this._getAssetsWithPositiveSentiment()

    if (qualifiedAssets.length === 0) {
      console.log('[DividendService] nenhum ativo com sentiment > 0.3 encontrado')
      return { processed: 0, skipped: 0 }
    }

    let totalProcessed = 0
    let totalSkipped = 0
    let checkpointIndex = 0

    for (const asset of qualifiedAssets) {
      const positions = await findPositionsByTicker(asset.ticker)

      const { processed, failed } = await processBatches(positions, async (pos) => {
        const user = await prisma.user.findUniqueOrThrow({ where: { id: pos.userId } })

        if (!user.planType) {
          console.warn(`[DividendService] planType indefinido para userId=${pos.userId}`)
          return
        }

        // INTAKE canônico: Jogador não recebe dividendos — ganho vem do capital gain (venda)
        if (user.planType === PLAN_TYPE.JOGADOR) {
          return
        }

        const amount = fixedRound(pos.quantity * pos.currentPrice * FINANCIAL_YIELD_RATE)
        // Craque e Lenda recebem dividendos creditados diretamente
        const status = DIVIDEND_STATUS.CREDITED

        await prisma.$transaction(async (tx) => {
          await tx.dividend.create({
            data: {
              userId: pos.userId,
              ticker: asset.ticker,
              clubName: asset.clubName,
              type: DIVIDEND_TYPE.FINANCEIRO,
              amount,
              yieldPercent: 0.5,
              status,
              processedMonth: processingMonth,
              createdAt: new Date(),
            },
          })

          await tx.user.update({
            where: { id: pos.userId },
            data: { fsBalance: { increment: amount } },
          })
        })

        const newBalance = await getWalletBalance(pos.userId)
        await sendNotification(pos.userId, NOTIFICATION_TYPE.DIVIDEND_CREDITED, {
          title: 'Dividendo Financeiro Creditado',
          body: `Você recebeu FS$${amount} de dividendo financeiro do ${asset.ticker}.`,
          metadata: { value: amount, ticker: asset.ticker, dividendType: 'Financeiro', newBalance },
        })
      })

      totalProcessed += processed
      totalSkipped += failed
      checkpointIndex++

      // Checkpoint a cada ativo processado para retomada em caso de timeout
      await this._saveCheckpoint(processingMonth, checkpointIndex)
    }

    console.log(`[DividendService] financeiro ${processingMonth}: ${totalProcessed} processados, ${totalSkipped} skipped`)
    return { processed: totalProcessed, skipped: totalSkipped }
  }

  /**
   * @deprecated INTAKE canônico: Jogador não recebe dividendos.
   * Mantido apenas para processar dividendos PENDING legados pré-correção.
   */
  async reinvestirDividendo(
    id: string,
    userId: string
  ): Promise<Dividend> {
    await prisma.$transaction(async (tx) => {
      await tx.dividend.update({
        where: { id },
        data: { status: DIVIDEND_STATUS.CREDITED },
      })

      const dividend = await tx.dividend.findUniqueOrThrow({ where: { id } })
      await tx.user.update({
        where: { id: userId },
        data: { fsBalance: { increment: dividend.amount } },
      })
    })

    const updated = await prisma.dividend.findUniqueOrThrow({ where: { id } })
    const newBalance = await getWalletBalance(userId)

    await sendNotification(userId, NOTIFICATION_TYPE.DIVIDEND_CREDITED, {
      title: 'Dividendo Creditado',
      body: `Dividendo de FS$${Number(updated.amount)} creditado para ${updated.ticker}.`,
      metadata: {
        value: Number(updated.amount),
        ticker: updated.ticker,
        dividendType: updated.type === DIVIDEND_TYPE.ESPORTIVO ? 'Esportivo' : 'Financeiro',
        newBalance,
      },
    })

    console.log(`[Reinvest] ${id} PENDING→CREDITED para userId=${userId}`)
    return updated
  }

  // ---------------------------------------------------------------------------
  // Privados
  // ---------------------------------------------------------------------------

  private async _getAssetsWithPositiveSentiment(): Promise<
    Array<{ ticker: string; clubName: string; sentiment: number }>
  > {
    try {
      // Tentar Redis — chave padrão definida pelo motor de mercado
      const keys = await redis.keys('club:sentiment:*')
      if (keys.length > 0) {
        const results: Array<{ ticker: string; clubName: string; sentiment: number }> = []

        for (const key of keys) {
          const val = await redis.get(key)
          if (!val) continue
          const sentiment = parseFloat(val)
          if (sentiment > FINANCIAL_SENTIMENT_THRESHOLD) {
            const ticker = key.replace('club:sentiment:', '')
            const asset = await prisma.asset.findUnique({ where: { ticker } })
            if (asset) {
              results.push({ ticker, clubName: asset.displayName, sentiment })
            }
          }
        }

        if (results.length > 0) return results
      }
    } catch {
      console.warn('[DividendService] Redis indisponível, usando fallback DB')
    }

    // Fallback: buscar todos os ativos do DB (sem filtro de sentiment — Redis indisponível)
    const assets = await prisma.asset.findMany({ where: { isHalted: false } })
    return assets.map(a => ({ ticker: a.ticker, clubName: a.displayName, sentiment: 1 }))
  }

  private async _saveCheckpoint(month: string, index: number): Promise<void> {
    try {
      await redis.set(`dividend:checkpoint:${month}`, String(index), 'EX', 86400)
    } catch {
      // Checkpoint falha silenciosamente — idempotência já garantida pelo processedMonth
    }
  }

  // ---------------------------------------------------------------------------
  // T-007: Delegadores para os novos serviços especializados
  // ---------------------------------------------------------------------------

  /**
   * Dispara dividendo de Resultado Esportivo (T-007 modalidade 1).
   * Substitui calcularDividendoEsportivo para novos triggers.
   */
  async processarResultadoEsportivo(params: {
    ticker: string
    triggerEvent: 'VITORIA' | 'TITULO' | 'CAMPEONATO'
    sentiment: number
    matchDate?: Date
  }): Promise<{ processed: number; failed: number }> {
    const result = await sportingResultDividendService.process(params)
    return { processed: result.processed, failed: result.failed }
  }

  /**
   * Processa dividendo Financeiro Periódico com critérios corretos (T-007 modalidade 2).
   * Usa FinancialPeriodicDividendService com filtros BULLISH + debtRatio + freeFloat.
   */
  async processarDividendoFinanceiroPeriodico(
    processingMonth: string
  ): Promise<{ processed: number; skipped: number }> {
    const result = await financialPeriodicDividendService.process(processingMonth)
    return { processed: result.processed, skipped: result.skipped }
  }
}

export const dividendService = new DividendService()
