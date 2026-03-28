import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L7 - Pressure Queue (News Impact)
 * Simula o impacto de notícias injetadas pelo admin.
 * O impacto decai linearmente ao longo dos ticks restantes.
 */
export class L7_PressureQueue implements QuantLayer {
  name = 'L7_PressureQueue'

  applyLayer(state: AssetState, _params: ClusterParams, _noise: number): LayerResult {
    if (state.newsImpact === 0 || state.newsImpactTicks <= 0) {
      return { layer: this.name, deltaPrice: 0 }
    }

    // Decaimento linear (normalizado para 0-1 assumindo max 10 ticks)
    const decayFactor = Math.min(1, state.newsImpactTicks / 10)
    const deltaPrice = state.newsImpact * decayFactor * state.currentPrice

    // Decrementar ticks restantes
    state.newsImpactTicks -= 1

    return {
      layer: this.name,
      deltaPrice,
      metadata: { newsImpact: state.newsImpact, ticksRemaining: state.newsImpactTicks },
    }
  }
}
