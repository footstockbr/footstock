import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

const CIRCUIT_BREAKER_THRESHOLD = 0.08  // 8%
const HALT_DURATION_TICKS = 150          // ~5 minutos (150 ticks × 2s)

export interface CircuitBreakerResult extends LayerResult {
  triggered: boolean
  haltTicks?: number
}

/**
 * L9 - Circuit Breaker
 * Interrompe negociações se a variação acumulada atingir 8%.
 * Paralisa o ativo por 150 ticks (~5 minutos).
 * Verificado ANTES de L1-L7 para curto-circuitar o pipeline.
 */
export class L9_CircuitBreaker implements QuantLayer {
  name = 'L9_CircuitBreaker'

  applyLayer(state: AssetState, _params: ClusterParams, _noise: number): CircuitBreakerResult {
    if (state.closePrice === 0) {
      return { layer: this.name, deltaPrice: 0, triggered: false }
    }

    const changePercent = Math.abs(
      (state.currentPrice - state.closePrice) / state.closePrice
    )

    if (changePercent >= CIRCUIT_BREAKER_THRESHOLD) {
      state.isPaused = true
      console.warn(
        `[L9] Circuit breaker ativado para ${state.ticker}: ${(changePercent * 100).toFixed(2)}% de variação`
      )

      return {
        layer: this.name,
        deltaPrice: 0,
        triggered: true,
        haltTicks: HALT_DURATION_TICKS,
        metadata: { changePercent, threshold: CIRCUIT_BREAKER_THRESHOLD },
      }
    }

    return { layer: this.name, deltaPrice: 0, triggered: false }
  }
}
