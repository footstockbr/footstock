// ============================================================================
// Foot Stock Motor — PriceCalculator
// Orquestra as 10 camadas quantitativas em ordem para calcular o novo preço.
//
// MAPEAMENTO INTAKE (6 camadas de realismo) → Código:
//   INTAKE "Ornstein-Uhlenbeck"     → L2_Anchor (mean reversion para fair value)
//   INTAKE "GARCH Clustering"       → L3_GARCH (volatilidade condicional)
//   INTAKE "Order Flow Imbalance"   → L1_OrderUnbalance + L4_OFI (split)
//   INTAKE "Kyle's Lambda"          → L5_KyleLambda (market impact)
//   INTAKE "Supply Scaling"         → L6_SupplyScaling (amplificação por float)
//   INTAKE "Pressure Queue"         → L7_PressureQueue (absorção de notícias)
//   INTAKE "Correlação Inter-Ativos" → L10_Correlation (rho por cluster + regional)
//   Guards: L9_CircuitBreaker (8%, halt 5min) + L8_VelocityCap (cap por tick)
// ============================================================================

import type { AssetState, ClusterParams, LayerResult, PreviousTickDelta } from '../types/motor.types'
import { L1_OrderUnbalance } from './layers/L1_OrderUnbalance'
import { L2_Anchor } from './layers/L2_Anchor'
import { L3_GARCH } from './layers/L3_GARCH'
import { L4_OFI } from './layers/L4_OFI'
import { L5_KyleLambda } from './layers/L5_KyleLambda'
import { L6_SupplyScaling } from './layers/L6_SupplyScaling'
import { L7_PressureQueue } from './layers/L7_PressureQueue'
import { L8_VelocityCap } from './layers/L8_VelocityCap'
import { L9_CircuitBreaker } from './layers/L9_CircuitBreaker'

export interface PriceCalculationResult {
  newPrice: number
  layerResults: LayerResult[]
  halted: boolean
}

export class PriceCalculator {
  private l1 = new L1_OrderUnbalance()
  private l2 = new L2_Anchor()
  private l3 = new L3_GARCH()
  private l4 = new L4_OFI()
  private l5 = new L5_KyleLambda()
  private l6 = new L6_SupplyScaling()
  private l7 = new L7_PressureQueue()
  private l8 = new L8_VelocityCap()
  private l9 = new L9_CircuitBreaker()

  /**
   * Rho de correlação por cluster (INTAKE canônico).
   * Ajuste de preço = rho × avgPeerDeltaPercent × currentPrice
   */
  private static readonly CLUSTER_RHO: Record<string, number> = {
    A_TOP:    0.35,
    A_MID:    0.15,
    A_SMALL:  0.08,
    B_LIQUID: 0.05,
    B_ILLIQ:  0.05,
  }

  /** Rho adicional para clubes do mesmo estado (correlação regional). */
  private static readonly REGIONAL_RHO = 0.10

  /**
   * Calcula o novo preço aplicando as 9 camadas em ordem:
   * L9 (guard) → L1-L7 (delta acumulado) → L8 (velocity cap) → L10 (correlação)
   *
   * @param state          Estado atual do ativo (mutado por L3 e L7)
   * @param params         Parâmetros do cluster do ativo
   * @param noise          Ruído gaussiano N(0,1) — injetado externamente para testabilidade
   * @param previousDeltas Deltas do tick anterior de todos os ativos (para correlação inter-ativos)
   */
  calculate(
    state: AssetState,
    params: ClusterParams,
    noise: number,
    previousDeltas?: Map<string, PreviousTickDelta>
  ): PriceCalculationResult {
    // Guard: ativo pausado (circuit breaker ou admin)
    if (state.isPaused) {
      return {
        newPrice: state.currentPrice,
        layerResults: [],
        halted: true,
      }
    }

    const layerResults: LayerResult[] = []

    // L9 primeiro: circuit breaker como guard do pipeline
    const cb = this.l9.applyLayer(state, params, noise)
    layerResults.push(cb)
    if (cb.triggered) {
      return { newPrice: state.currentPrice, layerResults, halted: true }
    }

    // L1-L7: acumular delta de cada camada
    let totalDelta = 0
    const layers = [this.l1, this.l2, this.l3, this.l4, this.l5, this.l6, this.l7]
    for (const layer of layers) {
      const result = layer.applyLayer(state, params, noise)
      totalDelta += result.deltaPrice
      layerResults.push(result)
    }

    // L8: aplicar velocity cap no total acumulado
    const cappedDelta = this.l8.applyCap(totalDelta, state.currentPrice, params.maxTickChange)
    layerResults.push({
      layer: 'L8_VelocityCap',
      deltaPrice: cappedDelta - totalDelta,
      metadata: { originalDelta: totalDelta, cappedDelta },
    })

    // L10: correlação inter-ativos + regional (INTAKE canônico)
    // Usa deltas do tick anterior como proxy — MarketEngine atualiza previousDeltas a cada tick.
    let correlationDelta = 0
    if (previousDeltas && previousDeltas.size > 1) {
      correlationDelta = this._computeCorrelation(state, previousDeltas)
      layerResults.push({
        layer: 'L10_Correlation',
        deltaPrice: correlationDelta,
        metadata: {
          clusterRho: PriceCalculator.CLUSTER_RHO[state.cluster] ?? 0,
          regionalRho: PriceCalculator.REGIONAL_RHO,
        },
      })
    }

    // Calcular novo preço com floor em 0.01 (ativo não pode ir a zero)
    const newPrice = Math.max(5.0, state.currentPrice + cappedDelta + correlationDelta)

    return { newPrice, layerResults, halted: false }
  }

  /**
   * L10 — Correlação inter-ativos e regional.
   *
   * Fórmula: corrDelta = rho_cluster × avgPeerDelta + rho_regional × avgRegionalDelta
   *   onde avgPeerDelta = preço médio de variação (FS$) dos pares do mesmo cluster no tick anterior
   *        avgRegionalDelta = preço médio de variação dos pares do mesmo estado no tick anterior
   *
   * O delta de correlação é velocity-capped a 20% do maxTickChange para evitar cascata.
   */
  private _computeCorrelation(
    state: AssetState,
    previousDeltas: Map<string, PreviousTickDelta>
  ): number {
    const rhoCluster = PriceCalculator.CLUSTER_RHO[state.cluster] ?? 0

    // Pares do mesmo cluster (excluindo o próprio ativo)
    const clusterPeers: number[] = []
    const regionalPeers: number[] = []

    for (const [id, delta] of previousDeltas) {
      if (id === state.id) continue
      if (delta.cluster === state.cluster) {
        clusterPeers.push(delta.deltaPercent)
      }
      if (delta.state === state.state && state.state !== '') {
        regionalPeers.push(delta.deltaPercent)
      }
    }

    let corrDelta = 0

    if (clusterPeers.length > 0) {
      const avgClusterDelta = clusterPeers.reduce((a, b) => a + b, 0) / clusterPeers.length
      // Converter deltaPercent em delta de preço
      corrDelta += rhoCluster * avgClusterDelta * state.currentPrice
    }

    if (regionalPeers.length > 0) {
      const avgRegionalDelta = regionalPeers.reduce((a, b) => a + b, 0) / regionalPeers.length
      corrDelta += PriceCalculator.REGIONAL_RHO * avgRegionalDelta * state.currentPrice
    }

    // Velocity cap para correlação: máx 20% do maxTickChange para evitar cascata
    const maxCorrDelta = state.currentPrice * 0.0007  // ~20% de 0.35% (maxTickChange A_TOP)
    return Math.max(-maxCorrDelta, Math.min(maxCorrDelta, corrDelta))
  }
}
