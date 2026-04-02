import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L2 - Anchor (Ornstein-Uhlenbeck Mean Reversion)
 * INTAKE canônico: dP = theta * (FV - P) * dt + sigma * dW
 *
 * Reverte para o fair value (não closePrice), com termo estocástico.
 * theta e sigma vêm dos ClusterParams (variam por clube/cluster).
 */
export class L2_Anchor implements QuantLayer {
  name = 'L2_Anchor'

  applyLayer(state: AssetState, params: ClusterParams, noise: number): LayerResult {
    // Fair value: usar fairValue se disponível, fallback para closePrice
    const fv = state.fairValue > 0 ? state.fairValue : state.closePrice
    if (fv === 0) {
      return { layer: this.name, deltaPrice: 0, metadata: { deviation: 0, theta: params.theta } }
    }

    const theta = params.theta ?? 0.05
    const sigma = params.sigma ?? 0.001

    // OU: Δp = θ × (FV - P) × dt + σ × dW
    // dt = 1 tick (normalizado)
    const meanReversion = theta * (fv - state.currentPrice)
    const stochastic = sigma * state.currentPrice * noise

    const deltaPrice = (meanReversion + stochastic) || 0

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        deviation: (state.currentPrice - fv) / fv,
        theta,
        sigma,
        fairValue: fv,
        meanReversion,
        stochastic,
      },
    }
  }
}
