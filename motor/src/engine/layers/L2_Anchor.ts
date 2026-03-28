import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L2 - Anchor (Mean Reversion)
 * Força de reversão ao preço de fechamento anterior.
 * Evita que o preço derive indefinidamente.
 *
 * Formula: Δp = -κ × (currentPrice - closePrice) / closePrice
 * κ = 0.05 (constante de reversão)
 */
export class L2_Anchor implements QuantLayer {
  name = 'L2_Anchor'
  private readonly kappa = 0.05

  applyLayer(state: AssetState, _params: ClusterParams, _noise: number): LayerResult {
    if (state.closePrice === 0) {
      return { layer: this.name, deltaPrice: 0, metadata: { deviation: 0, kappa: this.kappa } }
    }
    const deviation = (state.currentPrice - state.closePrice) / state.closePrice
    const deltaPrice = (-this.kappa * deviation * state.currentPrice) || 0

    return {
      layer: this.name,
      deltaPrice,
      metadata: { deviation, kappa: this.kappa },
    }
  }
}
