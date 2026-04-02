import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L6 - Supply Scaling
 * INTAKE canônico: amplifica impacto quando float remanescente diminui,
 * podendo chegar a 2x quando quase esgotado.
 *
 * Amplificação = 1 + min(1, volumeRatio) onde volumeRatio = volume/baseVolume
 * Quando volume está alto (float sendo consumido), amplifica o drift.
 */
export class L6_SupplyScaling implements QuantLayer {
  name = 'L6_SupplyScaling'

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    // Ratio de utilização: volume negociado vs volume base (proxy de float consumption)
    const volumeRatio = params.baseVolume > 0 ? state.volume / params.baseVolume : 0
    // Amplificação: de 1x (volume zero) até 2x (volume = baseVolume)
    const amplification = 1 + Math.min(1, volumeRatio)

    const deltaPrice = params.drift * state.currentPrice * amplification

    return {
      layer: this.name,
      deltaPrice,
      metadata: { drift: params.drift, volumeRatio, amplification },
    }
  }
}
