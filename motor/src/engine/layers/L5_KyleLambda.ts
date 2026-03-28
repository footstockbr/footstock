import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L5 - Kyle's Lambda (Market Impact)
 * Impacto permanente de preço proporcional ao volume negociado.
 * Simula o custo de impacto de mercado de grandes ordens.
 *
 * Formula: Δp = λ × (volume_traded / baseVolume) × currentPrice × sign(side)
 */
export class L5_KyleLambda implements QuantLayer {
  name = 'L5_KyleLambda'

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const totalVolume = state.pendingBuyVolume + state.pendingSellVolume
    if (totalVolume === 0) {
      return { layer: this.name, deltaPrice: 0, metadata: { volumeRatio: 0, lambda: params.lambdaKyle } }
    }

    const volumeRatio = totalVolume / params.baseVolume
    const netSign = state.pendingBuyVolume >= state.pendingSellVolume ? 1 : -1
    const deltaPrice = params.lambdaKyle * volumeRatio * state.currentPrice * netSign

    return {
      layer: this.name,
      deltaPrice,
      metadata: { volumeRatio, lambda: params.lambdaKyle },
    }
  }
}
