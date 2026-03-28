import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L1 - Order Unbalance
 * Calcula o desequilíbrio entre ordens de compra e venda pendentes.
 * Um desequilíbrio positivo (mais compras) empurra o preço para cima.
 *
 * Formula: Δp = lambda × (buyVol - sellVol) / totalVol
 */
export class L1_OrderUnbalance implements QuantLayer {
  name = 'L1_OrderUnbalance'

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const totalVol = state.pendingBuyVolume + state.pendingSellVolume
    if (totalVol === 0) {
      return { layer: this.name, deltaPrice: 0, metadata: { imbalance: 0 } }
    }

    const imbalance = (state.pendingBuyVolume - state.pendingSellVolume) / totalVol
    const deltaPrice = params.lambdaKyle * imbalance * state.currentPrice

    return {
      layer: this.name,
      deltaPrice,
      metadata: { imbalance, buyVol: state.pendingBuyVolume, sellVol: state.pendingSellVolume },
    }
  }
}
