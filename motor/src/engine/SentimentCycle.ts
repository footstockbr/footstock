// ============================================================================
// FootStock Motor — SentimentCycle
// Liga o SentimentCalculator ao motor (item 007 do loop 08-17, nunca ligado ate
// 2026-11-16). Roda na cadencia do SentimentWriter (~6 ticks), imediatamente
// antes da gravacao, e escreve em AssetState o score, o rotulo, a razao e os
// componentes que o writer persiste.
//
// Componentes (posicoes do calculador; peso 0 sai da media):
//   A  noticias, janela fixa de 72h (D17)          peso 0.35
//   B  momentum relativo intradia (secao 10.2)     peso 0.35
//   C  fluxo (OFI + book), desligado (secao 10.3)  peso 0
//   D,E sem uso                                     peso 0
//   F  noticia rapida intradia (activeNewsImpacts) peso 0.10
// Noticia somada 0.45 contra momentum 0.35: proporcao do desenho original.
//
// Sessao CLOSED: o ciclo NAO calcula. O ultimo valor fica congelado (como no
// halt), em vez de zerar para NEUTRAL toda noite e reiniciar a EMA do zero.
// Ativo pausado: ignorado (congelamento de halt fica com o MarketEngine).
// ============================================================================

import type { PrismaClient } from '@prisma/client'
import type { AssetState, SessionType } from '../types/motor.types'
import {
  calculateSentiment,
  type SentimentComponentInput,
  type SentimentLabel,
} from './SentimentCalculator'
import {
  fetchNewsWindow,
  computeWindowComponent,
  NEWS_WINDOW_MS,
  type NewsWindowRow,
} from '../news/NewsSentimentWindow'
import { computeFastTermComponent } from '../news/FastNewsTerm'
import { IMPACT_MAGNITUDE } from '../news/types'
import { logger } from '../utils/logger'

// ─── Constantes ──────────────────────────────────────────────────────────

export const SENTIMENT_WEIGHTS = {
  A: 0.35,
  B: 0.35,
  C: 0,
  D: 0,
  E: 0,
  F: 0.1,
} as const

/** Ticks entre recargas da janela de noticias (60 ticks = ~10 min). */
export const NEWS_WINDOW_REFRESH_TICKS = 60

/** z de momentum que satura o componente em +-1. */
export const MOMENTUM_Z_MAX = 2.0

/**
 * Horizonte (ticks) usado para reescalar a sigma por tick do GARCH ao retorno
 * desde a ancora. Piso de 1h evita z inflado logo apos re-ancora/boot; teto de
 * 7h cobre um pregao. hipotese: ordem de grandeza, nao calibrado.
 */
export const MOMENTUM_MIN_HORIZON_TICKS = 360
export const MOMENTUM_MAX_HORIZON_TICKS = 2520

/** Minimo de pares com retorno valido para usar a mediana do cluster. */
export const MOMENTUM_MIN_CLUSTER_PEERS = 2

/**
 * A magnitude de noticia em activeNewsImpacts e fracao do preco (0.005 a 0.05).
 * O termo rapido espera direcao em [-1, +1]; normaliza pela maior categoria.
 */
export const FAST_TERM_MAGNITUDE_SCALE = Math.max(...Object.values(IMPACT_MAGNITUDE))

// ─── Momentum (puro) ─────────────────────────────────────────────────────

export interface MomentumInput {
  id: string
  cluster: string
  currentPrice: number
  closePrice: number
  variance: number
  horizonTicks: number
}

export interface MomentumResult {
  value: number
  z: number
  logReturn: number
  peerMedian: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Momentum relativo intradia (secao 10.2 do desenho, parcela intradia):
 *   r_a = ln(currentPrice / closePrice)
 *   z_a = (r_a - mediana(r dos pares do mesmo cluster)) / (sqrt(variance) * sqrt(horizonte))
 *   M_a = clamp(z_a / MOMENTUM_Z_MAX, -1, +1)
 * Cluster com menos de 2 ativos validos usa a mediana do mercado inteiro.
 * Precos ou variancia invalidos devolvem 0 (sem sinal), nunca NaN.
 */
export function computeMomentumComponents(inputs: MomentumInput[]): Map<string, MomentumResult> {
  const returns = new Map<string, number>()
  for (const inp of inputs) {
    if (inp.currentPrice > 0 && inp.closePrice > 0) {
      const r = Math.log(inp.currentPrice / inp.closePrice)
      if (Number.isFinite(r)) returns.set(inp.id, r)
    }
  }

  const byCluster = new Map<string, number[]>()
  for (const inp of inputs) {
    const r = returns.get(inp.id)
    if (r === undefined) continue
    const list = byCluster.get(inp.cluster) ?? []
    list.push(r)
    byCluster.set(inp.cluster, list)
  }
  const marketMedian = median([...returns.values()])

  const out = new Map<string, MomentumResult>()
  for (const inp of inputs) {
    const r = returns.get(inp.id)
    if (r === undefined) {
      out.set(inp.id, { value: 0, z: 0, logReturn: 0, peerMedian: 0 })
      continue
    }
    const peers = byCluster.get(inp.cluster) ?? []
    const peerMedian = peers.length >= MOMENTUM_MIN_CLUSTER_PEERS ? median(peers) : marketMedian
    const horizon = Math.min(
      MOMENTUM_MAX_HORIZON_TICKS,
      Math.max(MOMENTUM_MIN_HORIZON_TICKS, inp.horizonTicks)
    )
    const sigma = Math.sqrt(Math.max(inp.variance, 0)) * Math.sqrt(horizon)
    if (!(sigma > 0) || !Number.isFinite(sigma)) {
      out.set(inp.id, { value: 0, z: 0, logReturn: r, peerMedian })
      continue
    }
    const z = (r - peerMedian) / sigma
    const value = Math.max(-1, Math.min(1, z / MOMENTUM_Z_MAX))
    out.set(inp.id, { value: Number.isFinite(value) ? value : 0, z, logReturn: r, peerMedian })
  }
  return out
}

// ─── Ciclo ───────────────────────────────────────────────────────────────

export interface SentimentCycleDeps {
  prisma: PrismaClient
  assetStates: Map<string, AssetState>
  now?: () => Date
}

interface NewsCache {
  rowsByTicker: Map<string, NewsWindowRow[]>
  unclassifiedByTicker: Map<string, number>
}

const EMPTY_CACHE: NewsCache = { rowsByTicker: new Map(), unclassifiedByTicker: new Map() }

function round(n: number, digits = 4): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function asLabel(label: string | undefined): SentimentLabel {
  return label === 'BULLISH' || label === 'BEARISH' ? label : 'NEUTRAL'
}

export class SentimentCycle {
  private prisma: PrismaClient
  private assetStates: Map<string, AssetState>
  private now: () => Date
  private news: NewsCache = EMPTY_CACHE
  private lastNewsRefreshTick: number | null = null
  /** Ancora do momentum por ativo: closePrice observado e o tick em que mudou. */
  private anchors = new Map<string, { closePrice: number; sinceTick: number }>()

  constructor(deps: SentimentCycleDeps) {
    this.prisma = deps.prisma
    this.assetStates = deps.assetStates
    this.now = deps.now ?? (() => new Date())
  }

  private async refreshNews(tickCount: number): Promise<void> {
    if (
      this.lastNewsRefreshTick !== null &&
      tickCount - this.lastNewsRefreshTick < NEWS_WINDOW_REFRESH_TICKS
    ) {
      return
    }
    const now = this.now()
    try {
      const [window, unclassified] = await Promise.all([
        fetchNewsWindow(this.prisma, now),
        this.prisma.news.groupBy({
          by: ['ticker'],
          where: {
            isPublished: true,
            publishedAt: { gte: new Date(now.getTime() - NEWS_WINDOW_MS) },
            sentimentClassifiedAt: null,
          },
          _count: { _all: true },
        }),
      ])
      const rowsByTicker = new Map<string, NewsWindowRow[]>()
      for (const row of window.rows) {
        if (!row.ticker) continue
        const list = rowsByTicker.get(row.ticker) ?? []
        list.push(row)
        rowsByTicker.set(row.ticker, list)
      }
      const unclassifiedByTicker = new Map<string, number>()
      for (const g of unclassified) {
        if (g.ticker) unclassifiedByTicker.set(g.ticker, g._count._all)
      }
      this.news = { rowsByTicker, unclassifiedByTicker }
      this.lastNewsRefreshTick = tickCount
      logger.info(
        JSON.stringify({
          event: 'sentiment_news_window_refreshed',
          rows: window.count,
          tickers: rowsByTicker.size,
        })
      )
    } catch (err) {
      // Mantem o cache anterior; tenta de novo na proxima cadencia.
      logger.warn(`[engine] SentimentCycle: falha ao recarregar janela de noticias: ${String(err)}`)
    }
  }

  private horizonTicks(state: AssetState, tickCount: number): number {
    const anchor = this.anchors.get(state.id)
    if (!anchor || anchor.closePrice !== state.closePrice) {
      this.anchors.set(state.id, { closePrice: state.closePrice, sinceTick: tickCount })
      return 0
    }
    return tickCount - anchor.sinceTick
  }

  /**
   * Calcula o sentimento de todos os ativos nao pausados e grava em AssetState.
   * Nunca lanca: erro por ativo e logado e o ativo mantem o valor anterior.
   */
  async run(tickCount: number, sessionType: SessionType): Promise<void> {
    if (sessionType === 'CLOSED') return

    await this.refreshNews(tickCount)

    const active = [...this.assetStates.values()].filter(s => !s.isPaused)
    const momentum = computeMomentumComponents(
      active.map(s => ({
        id: s.id,
        cluster: s.cluster,
        currentPrice: s.currentPrice,
        closePrice: s.closePrice,
        variance: s.variance,
        horizonTicks: this.horizonTicks(s, tickCount),
      }))
    )

    for (const state of active) {
      try {
        const rows = this.news.rowsByTicker.get(state.ticker) ?? []
        const unclassified = this.news.unclassifiedByTicker.get(state.ticker) ?? 0
        const window = computeWindowComponent(rows, unclassified)
        const fast = computeFastTermComponent(
          (state.activeNewsImpacts ?? []).map(n => ({
            ...n,
            magnitude: Math.max(-1, Math.min(1, n.magnitude / FAST_TERM_MAGNITUDE_SCALE)),
          }))
        )
        const mom = momentum.get(state.id) ?? { value: 0, z: 0, logReturn: 0, peerMedian: 0 }

        const components: SentimentComponentInput = {
          A: { value: window.value, weight: SENTIMENT_WEIGHTS.A },
          B: { value: mom.value, weight: SENTIMENT_WEIGHTS.B },
          C: { value: 0, weight: SENTIMENT_WEIGHTS.C },
          D: { value: 0, weight: SENTIMENT_WEIGHTS.D },
          E: { value: 0, weight: SENTIMENT_WEIGHTS.E },
          F: { value: fast.value, weight: SENTIMENT_WEIGHTS.F },
        }
        const totalPublished = window.count + unclassified
        const previousLabel = asLabel(state.sentimentLabel)
        const previousFlipTick = state.sentimentLastFlipTick ?? 0
        const output = calculateSentiment({
          components,
          previousScore: state.sentimentScore ?? 0,
          previousLabel,
          previousFlipTick,
          currentTick: tickCount,
          sessionType,
          metadata: window.lowCoverage
            ? {
                aLowCoverage: true,
                aUnclassifiedCount: unclassified,
                aTotalPublished: totalPublished,
                aCoverageRatio: totalPublished > 0 ? window.count / totalPublished : 0,
              }
            : undefined,
        })

        state.sentimentScore = round(output.score)
        state.sentimentLabel = output.label
        state.sentimentReason = output.reason
        state.sentimentComponents = {
          ...output.components,
          inputs: {
            news: {
              count: window.count,
              bullish: window.positiveCount,
              bearish: window.negativeCount,
              neutral: window.neutralCount,
              unclassified,
              lowCoverage: window.lowCoverage,
            },
            momentum: {
              z: round(mom.z),
              logReturn: round(mom.logReturn, 6),
              peerMedian: round(mom.peerMedian, 6),
            },
            fastNews: { active: fast.activeCount },
          },
        }
        if (output.flipOccurred) {
          state.sentimentLastFlipTick = tickCount
          // Uma linha por virada: base para calibrar THRESHOLD_BULLISH/BEARISH e
          // MIN_PERMANENCE_TICKS com dados de prod (deploymentLogs filter "sentiment_label_flip").
          logger.info(
            JSON.stringify({
              event: 'sentiment_label_flip',
              ticker: state.ticker,
              from: previousLabel,
              to: output.label,
              score: round(output.score),
              tick: tickCount,
              ticksSincePreviousFlip: tickCount - previousFlipTick,
              newsCount: window.count,
              momentumZ: round(mom.z),
              fastNewsActive: fast.activeCount,
            })
          )
        }
      } catch (err) {
        logger.warn(`[engine] SentimentCycle: falha no ativo ${state.ticker}: ${String(err)}`)
      }
    }
  }
}
