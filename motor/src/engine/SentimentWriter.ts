// ============================================================================
// FootStock Motor — SentimentWriter
// Escritor dedicado das colunas de sentimento do ativo. Cadencia propria
// (~6 ticks, ~60s com tick=10s) com dirty-check por ativo. Contrato de
// concorrencia: (1) colunas disjuntas de updateAssetPrices, (2) sem transacao
// cruzada, (3) processo lider unico (confia no caller), (4) nao grava para
// ativo pausado (isPaused).
// ============================================================================

import { Prisma, type PrismaClient } from '@prisma/client'
import type { AssetState } from '../types/motor.types'
import { logger } from '../utils/logger'

// ─── Constantes exportadas ───────────────────────────────────────────────

/** Ticks entre gravacoes de sentimento (~60s com tick=10s). */
export const SENTIMENT_WRITE_CADENCE = 6

/** Variacao minima do score para considerar dirty (acima deste limiar -> reescreve). */
export const SENTIMENT_SCORE_EPSILON = 0.01

// ─── Interfaces ──────────────────────────────────────────────────────────

export interface SentimentWriterDeps {
  prisma: PrismaClient
  assetStates: Map<string, AssetState>
  layersEnabled?: Partial<Record<string, boolean>>
}

// ─── Classe ──────────────────────────────────────────────────────────────

export class SentimentWriter {
  private prisma: PrismaClient
  private assetStates: Map<string, AssetState>
  private layersEnabled: Partial<Record<string, boolean>> | undefined
  private lastWrittenScore: Map<string, number> = new Map()
  private lastWrittenLabel: Map<string, string> = new Map()
  private tickCounter = 0

  constructor(deps: SentimentWriterDeps) {
    this.prisma = deps.prisma
    this.assetStates = deps.assetStates
    this.layersEnabled = deps.layersEnabled
  }

  updateLayersEnabled(layersEnabled: Partial<Record<string, boolean>>): void {
    this.layersEnabled = layersEnabled
  }

  // ─── Dirty-check (ST002) ─────────────────────────────────────────────

  /**
   * Retorna true se o ativo precisa ser gravado:
   * - Primeira gravacao (sem entrada em lastWrittenLabel) -> sempre dirty.
   * - Rotulo flipou -> dirty.
   * - Score mudou acima do epsilon -> dirty.
   * - Caso contrario -> not dirty.
   */
  private isDirty(state: AssetState): boolean {
    const lastLabel = this.lastWrittenLabel.get(state.id)
    if (lastLabel === undefined) return true

    if (state.sentimentLabel !== lastLabel) return true

    const lastScore = this.lastWrittenScore.get(state.id) ?? 0
    const currentScore = state.sentimentScore ?? 0
    if (Math.abs(currentScore - lastScore) > SENTIMENT_SCORE_EPSILON) return true

    return false
  }

  // ─── Gravacao (ST003) ────────────────────────────────────────────────

  /**
   * Varre ativos, filtra dirty + nao-pausados, grava as seis colunas de
   * sentimento via Promise.allSettled de prisma.asset.update (mesmo padrao
   * do updateAssetPrices). Apos gravacao bem-sucedida, atualiza lastWritten*.
   */
  private async writeSentiments(): Promise<void> {
    const eligible: AssetState[] = []
    for (const state of this.assetStates.values()) {
      if (state.isPaused) continue
      if (!this.isDirty(state)) continue
      eligible.push(state)
    }

    if (eligible.length === 0) return

    const updates = eligible.map(state =>
      this.prisma.asset.update({
        where: { id: state.id },
        data: {
          sentiment: state.sentimentLabel ?? 'NEUTRAL',
          sentimentScore: state.sentimentScore ?? 0,
          sentimentReason: state.sentimentReason ?? null,
          sentimentComponents: state.sentimentComponents
            ? (state.sentimentComponents as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          sentimentUpdatedAt: new Date(),
          sentimentLastFlipAt:
            (state.sentimentLastFlipTick ?? 0) > 0 ? new Date() : undefined,
        },
      }),
    )

    const results = await Promise.allSettled(updates)

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        logger.warn(
          `[engine] SentimentWriter: rejected asset=${eligible[i].id}: ${result.reason}`,
        )
      } else {
        const state = eligible[i]
        this.lastWrittenScore.set(state.id, state.sentimentScore ?? 0)
        this.lastWrittenLabel.set(state.id, state.sentimentLabel ?? 'NEUTRAL')
      }
    })
  }

  // ─── Metodo publico com cadencia (ST004) ─────────────────────────────

  /**
   * Chamado a cada tick pelo MarketEngine. So grava quando tickCounter
   * e multiplo de SENTIMENT_WRITE_CADENCE. Erro em writeSentiments nao
   * propaga (o writer nao deve travar o tick loop).
   */
  async tick(): Promise<void> {
    if (this.layersEnabled?.sentimentCalc === false) return
    this.tickCounter++
    if (this.tickCounter % SENTIMENT_WRITE_CADENCE !== 0) return
    try {
      await this.writeSentiments()
    } catch (err) {
      logger.error('[engine] SentimentWriter: erro inesperado:', err)
    }
  }
}
