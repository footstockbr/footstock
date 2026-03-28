// ============================================================================
// Foot Stock Motor — PriceCalculator
// Orquestra as 9 camadas quantitativas em ordem para calcular o novo preço.
// ============================================================================

import type { AssetState, ClusterParams, LayerResult } from '../types/motor.types'
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
   * Calcula o novo preço aplicando as 9 camadas em ordem:
   * L9 (guard) → L1-L7 (delta acumulado) → L8 (velocity cap)
   *
   * @param state  Estado atual do ativo (mutado por L3 e L7)
   * @param params Parâmetros do cluster do ativo
   * @param noise  Ruído gaussiano N(0,1) — injetado externamente para testabilidade
   */
  calculate(
    state: AssetState,
    params: ClusterParams,
    noise: number
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

    // Calcular novo preço com floor em 0.01 (ativo não pode ir a zero)
    const newPrice = Math.max(0.01, state.currentPrice + cappedDelta)

    return { newPrice, layerResults, halted: false }
  }
}
