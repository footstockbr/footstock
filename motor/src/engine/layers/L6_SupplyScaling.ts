import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L6 - Supply Scaling (Drift)
 * Deriva tendencial baseada no cluster do ativo.
 * Ativos da Série B têm drift negativo leve (menor liquidez).
 */
export class L6_SupplyScaling implements QuantLayer {
  name = 'L6_SupplyScaling'

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const deltaPrice = params.drift * state.currentPrice

    return {
      layer: this.name,
      deltaPrice,
      metadata: { drift: params.drift },
    }
  }
}
