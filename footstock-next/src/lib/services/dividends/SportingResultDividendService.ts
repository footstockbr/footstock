// ============================================================================
// FootStock — SportingResultDividendService (T-007)
// Modalidade 1: Dividendo de Resultado Esportivo.
// Disparado quando uma notícia classificada como MATCH_RESULT com
// sentiment > 0.5 é processada, indicando vitória do clube.
// Distribui % do tesouro simulado para holders na snapshotDate.
// Rastreabilidade: T-007 §2 / FDD trading-carteira.md §2.5
// ============================================================================

import { prisma } from '@/lib/prisma'
import { DIVIDEND_TYPE, DIVIDEND_STATUS, NOTIFICATION_TYPE } from '@/lib/enums'
import { sendNotification } from '@/lib/services/NotificationService'
import { getWalletBalance } from '@/lib/services/WalletService'
import { getPlanDividendEligibility, isUserEligibleForDividend } from './PlanDividendPolicy'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Percentual default do tesouro simulado distribuído por vitória */
const DEFAULT_TREASURY_YIELD_RATE = 0.005 // 0.5%

/** Percentual para título/campeonato */
const CHAMPIONSHIP_YIELD_RATE = 0.030 // 3.0%

/** Tesouro simulado default por clube (FS$) — configurável futuramente via tabela */
const DEFAULT_TREASURY_VALUE = 100_000

const BATCH_SIZE = 10

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface SportingDividendInput {
  ticker: string
  triggerEvent: 'VITORIA' | 'TITULO' | 'CAMPEONATO'
  /** Sentimento da notícia [0, 1] */
  sentiment: number
  /** Data do jogo — usado como snapshotDate. Default: agora */
  matchDate?: Date
  /** Override do yield rate (para configurações futuras via banco) */
  yieldRateOverride?: number
}

export interface SportingDividendResult {
  ticker: string
  triggerEvent: string
  processed: number
  failed: number
  totalDistributed: number
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SportingResultDividendService {
  /**
   * Processa dividendo de resultado esportivo para todos os holders na snapshotDate.
   * - CRAQUE/LENDA: crédito direto no saldo FS$
   * - JOGADOR: cria registro em yield_differential_pending
   */
  async process(input: SportingDividendInput): Promise<SportingDividendResult> {
    const { ticker, triggerEvent, sentiment, matchDate, yieldRateOverride } = input
    const snapshotDate = matchDate ?? new Date()

    // Verificar sentimento mínimo para vitória
    if (sentiment < 0.5 && triggerEvent === 'VITORIA') {
      console.log(`[SportingResultDividend] sentiment ${sentiment} abaixo de 0.5 para ${ticker} — ignorado`)
      return { ticker, triggerEvent, processed: 0, failed: 0, totalDistributed: 0 }
    }

    const yieldRate = yieldRateOverride
      ?? (triggerEvent === 'TITULO' || triggerEvent === 'CAMPEONATO'
        ? CHAMPIONSHIP_YIELD_RATE
        : DEFAULT_TREASURY_YIELD_RATE)

    // Buscar asset
    const asset = await prisma.asset.findUnique({ where: { ticker } })
    if (!asset) {
      console.warn(`[SportingResultDividend] ativo não encontrado: ${ticker}`)
      return { ticker, triggerEvent, processed: 0, failed: 0, totalDistributed: 0 }
    }

    // Tesouro simulado: configurável futuramente via tabela de config
    const treasuryValue = DEFAULT_TREASURY_VALUE
    const totalDistributableAmount = treasuryValue * yieldRate

    // Buscar holders na snapshotDate (posições abertas com qty > 0)
    const positions = await prisma.position.findMany({
      where: { assetId: asset.id, status: 'OPEN', quantity: { gt: 0 } },
      include: {
        user: {
          select: { id: true, planType: true, status: true },
        },
      },
    })

    if (positions.length === 0) {
      console.log(`[SportingResultDividend] nenhum holder para ${ticker}`)
      return { ticker, triggerEvent, processed: 0, failed: 0, totalDistributed: 0 }
    }

    const totalShares = positions.reduce((sum, p) => sum + Number(p.quantity), 0)
    const pricePerShare = totalShares > 0 ? fixedRound(totalDistributableAmount / totalShares) : 0

    const clubName = asset.displayName

    let processed = 0
    let failed = 0
    let totalDistributed = 0

    // Processar em batches para não saturar conexões DB
    for (let i = 0; i < positions.length; i += BATCH_SIZE) {
      const batch = positions.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(pos => this._processHolder({
          pos,
          ticker,
          clubName,
          triggerEvent,
          snapshotDate,
          pricePerShare,
          yieldPercent: fixedRound(yieldRate * 100),
        }))
      )

      for (const r of results) {
        if (r.status === 'fulfilled') {
          processed++
          totalDistributed += r.value.amountDistributed
        } else {
          failed++
          console.error('[SportingResultDividend] batch error:', r.reason)
        }
      }
    }

    // Log de auditoria
    await this._auditLog(ticker, triggerEvent, snapshotDate, processed, totalDistributed)

    console.log(`[SportingResultDividend] ${triggerEvent} ${ticker}: ${processed} processados, ${failed} falhas, FS$${totalDistributed} distribuídos`)

    return { ticker, triggerEvent, processed, failed, totalDistributed }
  }

  private async _processHolder(params: {
    pos: {
      userId: string
      quantity: unknown
      user: { id: string; planType: string | null; status: string }
    }
    ticker: string
    clubName: string
    triggerEvent: string
    snapshotDate: Date
    pricePerShare: number
    yieldPercent: number
  }): Promise<{ amountDistributed: number }> {
    const { pos, ticker, clubName, triggerEvent, snapshotDate, pricePerShare, yieldPercent } = params
    const user = pos.user
    const shares = Number(pos.quantity)

    // Verificar elegibilidade
    const eligibility = isUserEligibleForDividend({
      planType: user.planType,
      userStatus: user.status,
      
    })

    if (!eligibility.eligible) {
      console.log(`[SportingResultDividend] userId=${user.id} inelegível: ${eligibility.reason}`)
      return { amountDistributed: 0 }
    }

    const amount = fixedRound(shares * pricePerShare)
    const policy = getPlanDividendEligibility(user.planType)

    if (policy.shouldCreditDirect) {
      // CRAQUE / LENDA: crédito direto
      await prisma.$transaction(async (tx) => {
        await tx.dividend.create({
          data: {
            userId: user.id,
            ticker,
            clubName,
            type: DIVIDEND_TYPE.SPORTING_RESULT,
            amount,
            yieldPercent,
            status: DIVIDEND_STATUS.CREDITED,
            triggerEvent,
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
        title: 'Dividendo Esportivo Creditado',
        body: `FS$${amount} de dividendo esportivo do ${ticker} (${triggerEvent}).`,
        metadata: { value: amount, ticker, dividendType: 'Resultado Esportivo', newBalance },
      })

      return { amountDistributed: amount }
    }

    if (policy.shouldCreatePending) {
      // JOGADOR: acumula em yield_differential_pending (sem crédito no saldo)
      const dividend = await prisma.dividend.create({
        data: {
          userId: user.id,
          ticker,
          clubName,
          type: DIVIDEND_TYPE.SPORTING_RESULT,
          amount,
          yieldPercent,
          status: DIVIDEND_STATUS.BLOCKED_PLAN,
          triggerEvent,
          snapshotDate,
          sharesSnapshot: shares,
          pricePerShare,
        },
      })

      await prisma.yieldDifferentialPending.upsert({
        where: { userId_sourceDividendId: { userId: user.id, sourceDividendId: dividend.id } },
        create: {
          userId: user.id,
          ticker,
          sourceType: DIVIDEND_TYPE.SPORTING_RESULT,
          sourceDividendId: dividend.id,
          snapshotDate,
          sharesSnapshot: shares,
          pendingAmount: amount,
          status: 'PENDING',
        },
        update: {
          pendingAmount: { increment: amount },
        },
      })

      return { amountDistributed: 0 } // JOGADOR não conta como distribuído
    }

    return { amountDistributed: 0 }
  }

  private async _auditLog(
    ticker: string,
    triggerEvent: string,
    snapshotDate: Date,
    processed: number,
    totalDistributed: number
  ): Promise<void> {
    // AdminMarketAction requer adminId (FK obrigatório) — log via console apenas para ações automáticas
    // Para rastreabilidade futura, considerar tabela de system_events separada
    console.info('[AUDIT] SportingResultDividend', {
      ticker,
      triggerEvent,
      snapshotDate: snapshotDate.toISOString(),
      processed,
      totalDistributed,
    })
  }
}

function fixedRound(value: number): number {
  return Math.round(value * 100) / 100
}

export const sportingResultDividendService = new SportingResultDividendService()
