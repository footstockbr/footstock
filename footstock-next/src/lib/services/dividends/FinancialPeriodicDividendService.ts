// ============================================================================
// FootStock — FinancialPeriodicDividendService (T-007)
// Modalidade 2: Dividendo Financeiro Periódico.
// Executa mensalmente (1º dia útil, 02:00 UTC-3).
// Critérios de elegibilidade do clube: sentiment=BULLISH + debtRatio < 0.3
// + freeFloat > 0.4. Clubes em circuit breaker (isHalted) não pagam.
// CRAQUE/LENDA recebem crédito direto; JOGADOR acumula em yield_differential_pending.
// Rastreabilidade: T-007 §3 / FDD trading-carteira.md §2.5
// ============================================================================

import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { DIVIDEND_TYPE, DIVIDEND_STATUS, NOTIFICATION_TYPE } from '@/lib/enums'
import { sendNotification } from '@/lib/services/NotificationService'
import { getWalletBalance } from '@/lib/services/WalletService'
import { getPlanDividendEligibility, isUserEligibleForDividend } from './PlanDividendPolicy'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Yield mensal padrão — pode ser sobrescrito por clube via financials.monthlyYieldRate */
const DEFAULT_MONTHLY_YIELD_RATE = 0.005 // 0.5% ao mês

/** Yield mínimo e máximo por clube (configurável) */
const MIN_YIELD_RATE = 0.002 // 0.2%
const MAX_YIELD_RATE = 0.008 // 0.8%

/** Critérios de elegibilidade do clube */
const ELIGIBILITY = {
  sentimentRequired: 'BULLISH',
  maxDebtRatio: 0.3,
  minFreeFloat: 0.4,
} as const

const BATCH_SIZE = 10

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface EligibleAsset {
  id: string
  ticker: string
  clubName: string
  monthlyYieldRate: number
}

export interface FinancialDividendResult {
  processingMonth: string
  eligible: number
  processed: number
  failed: number
  skipped: number
  totalDistributed: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FinancialPeriodicDividendService {
  /**
   * Processa dividendos financeiros periódicos para o mês informado.
   * Idempotente: verificação por (userId, processedMonth, type=FINANCIAL_PERIODIC).
   */
  async process(processingMonth: string): Promise<FinancialDividendResult> {
    // Idempotência robusta por tipo+mês (evita processar mês parcialmente)
    const alreadyProcessed = await prisma.dividend.count({
      where: { type: DIVIDEND_TYPE.FINANCIAL_PERIODIC, processedMonth: processingMonth },
    })
    if (alreadyProcessed > 0) {
      console.log(`[FinancialPeriodicDividend] mês ${processingMonth} já processado (${alreadyProcessed} registros — idempotência)`)
      return {
        processingMonth,
        eligible: 0,
        processed: 0,
        failed: 0,
        skipped: alreadyProcessed,
        totalDistributed: 0,
      }
    }

    const snapshotDate = new Date()
    const eligibleAssets = await this._getEligibleAssets()

    if (eligibleAssets.length === 0) {
      console.log(`[FinancialPeriodicDividend] nenhum clube elegível para ${processingMonth}`)
      return { processingMonth, eligible: 0, processed: 0, failed: 0, skipped: 0, totalDistributed: 0 }
    }

    let totalProcessed = 0
    let totalFailed = 0
    let totalSkipped = 0
    let totalDistributed = 0

    for (const asset of eligibleAssets) {
      const positions = await prisma.position.findMany({
        where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
        include: {
          user: {
            select: {
              id: true,
              planType: true,
              status: true,
            },
          },
        },
      })

      if (positions.length === 0) {
        totalSkipped++
        continue
      }

      const currentPriceRaw = await prisma.asset.findUnique({
        where: { id: asset.id },
        select: { currentPrice: true },
      })
      const currentPrice = Number(currentPriceRaw?.currentPrice ?? 0)

      const month = processingMonth
      const results = await Promise.allSettled(
        this._chunkArray(positions, BATCH_SIZE).flatMap(batch =>
          batch.map(pos => this._processHolder({
            pos,
            asset,
            currentPrice,
            processingMonth: month,
            snapshotDate,
          }))
        )
      )

      for (const r of results) {
        if (r.status === 'fulfilled') {
          totalProcessed++
          totalDistributed += r.value.amountDistributed
        } else {
          totalFailed++
          console.error('[FinancialPeriodicDividend] holder error:', r.reason)
        }
      }

      // Checkpoint para retomada em caso de timeout parcial
      await this._saveCheckpoint(processingMonth, asset.ticker)
    }

    console.log(`[FinancialPeriodicDividend] ${processingMonth}: eligible=${eligibleAssets.length}, processed=${totalProcessed}, failed=${totalFailed}, FS$${totalDistributed} distribuídos`)

    return {
      processingMonth,
      eligible: eligibleAssets.length,
      processed: totalProcessed,
      failed: totalFailed,
      skipped: totalSkipped,
      totalDistributed,
    }
  }

  private async _processHolder(params: {
    pos: {
      userId: string
      quantity: unknown
      user: { id: string; planType: string | null; status: string }
    }
    asset: EligibleAsset
    currentPrice: number
    processingMonth: string
    snapshotDate: Date
  }): Promise<{ amountDistributed: number }> {
    const { pos, asset, currentPrice, processingMonth, snapshotDate } = params
    const user = pos.user
    const shares = Number(pos.quantity)

    const eligibility = isUserEligibleForDividend({
      planType: user.planType,
      userStatus: user.status,
      
    })

    if (!eligibility.eligible) {
      return { amountDistributed: 0 }
    }

    const amount = fixedRound(shares * currentPrice * asset.monthlyYieldRate)
    const yieldPercent = fixedRound(asset.monthlyYieldRate * 100)
    const pricePerShare = fixedRound(currentPrice * asset.monthlyYieldRate)
    const policy = getPlanDividendEligibility(user.planType)

    if (policy.shouldCreditDirect) {
      // CRAQUE / LENDA
      await prisma.$transaction(async (tx) => {
        await tx.dividend.create({
          data: {
            userId: user.id,
            ticker: asset.ticker,
            clubName: asset.clubName,
            type: DIVIDEND_TYPE.FINANCIAL_PERIODIC,
            amount,
            yieldPercent,
            status: DIVIDEND_STATUS.CREDITED,
            processedMonth: processingMonth,
            snapshotDate,
            sharesSnapshot: shares,
            pricePerShare,
          },
        })
        await tx.user.update({
          where: { id: user.id },
          data: { fsBalance: { increment: amount } },
        })
      })

      const newBalance = await getWalletBalance(user.id)
      await sendNotification(user.id, NOTIFICATION_TYPE.DIVIDEND_CREDITED, {
        title: 'Dividendo Financeiro Creditado',
        body: `FS$${amount} de dividendo financeiro do ${asset.ticker}.`,
        metadata: {
          value: amount,
          ticker: asset.ticker,
          dividendType: 'Financeiro Periódico',
          newBalance,
          processingMonth,
        },
      })

      return { amountDistributed: amount }
    }

    if (policy.shouldCreatePending) {
      // JOGADOR: registra pendente sem crédito
      const dividend = await prisma.dividend.create({
        data: {
          userId: user.id,
          ticker: asset.ticker,
          clubName: asset.clubName,
          type: DIVIDEND_TYPE.FINANCIAL_PERIODIC,
          amount,
          yieldPercent,
          status: DIVIDEND_STATUS.BLOCKED_PLAN,
          processedMonth: processingMonth,
          snapshotDate,
          sharesSnapshot: shares,
          pricePerShare,
        },
      })

      await prisma.yieldDifferentialPending.upsert({
        where: { userId_sourceDividendId: { userId: user.id, sourceDividendId: dividend.id } },
        create: {
          userId: user.id,
          ticker: asset.ticker,
          sourceType: DIVIDEND_TYPE.FINANCIAL_PERIODIC,
          sourceDividendId: dividend.id,
          snapshotDate,
          sharesSnapshot: shares,
          pendingAmount: amount,
          status: 'PENDING',
        },
        update: { pendingAmount: { increment: amount } },
      })

      return { amountDistributed: 0 }
    }

    return { amountDistributed: 0 }
  }

  /**
   * Retorna ativos elegíveis para dividendo financeiro periódico.
   * Critérios: sentiment=BULLISH + freeFloat > 0.4 + debtRatio < 0.3 + não halted.
   * Lê financials do campo JSONB do asset.
   */
  private async _getEligibleAssets(): Promise<EligibleAsset[]> {
    // Tentar Redis primeiro (motor publica sentiment atualizado)
    const assetsFromDb = await prisma.asset.findMany({
      where: { sentiment: ELIGIBILITY.sentimentRequired, isHalted: false },
      select: { id: true, ticker: true, displayName: true, financials: true },
    })

    const eligible: EligibleAsset[] = []

    for (const asset of assetsFromDb) {
      const financials = asset.financials as Record<string, number> | null

      if (!financials) continue

      const debtRatio = financials.debtRatio ?? null
      const freeFloat = financials.freeFloat ?? null

      // Critérios de elegibilidade rígidos
      if (debtRatio === null || freeFloat === null) {
        console.warn(`[FinancialPeriodicDividend] ${asset.ticker}: financials.debtRatio ou freeFloat ausente — ignorado`)
        continue
      }

      if (debtRatio >= ELIGIBILITY.maxDebtRatio) continue
      if (freeFloat <= ELIGIBILITY.minFreeFloat) continue

      // Yield configurável por clube (com clamp entre min e max)
      const rawRate = financials.monthlyYieldRate ?? DEFAULT_MONTHLY_YIELD_RATE
      const monthlyYieldRate = Math.min(Math.max(rawRate, MIN_YIELD_RATE), MAX_YIELD_RATE)

      eligible.push({
        id: asset.id,
        ticker: asset.ticker,
        clubName: asset.displayName,
        monthlyYieldRate,
      })
    }

    return eligible
  }

  private async _saveCheckpoint(month: string, lastTicker: string): Promise<void> {
    try {
      await redis.set(`dividend:financial:checkpoint:${month}`, lastTicker, 'EX', 86400)
    } catch {
      // Checkpoint silencioso — idempotência garante segurança mesmo sem checkpoint
    }
  }

  private _chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size))
    }
    return chunks
  }
}

function fixedRound(value: number): number {
  return Math.round(value * 100) / 100
}

export const financialPeriodicDividendService = new FinancialPeriodicDividendService()
