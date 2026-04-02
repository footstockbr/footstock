import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L4 - Order Flow Imbalance (OFI)
 * INTAKE canônico: mede pressão cumulativa compra vs venda.
 * Decay por cluster: A_TOP ~0.91 (dissipa rápido), B_ILLIQ ~0.97 (persiste).
 *
 * Formula: Δp = OFI × λ × currentPrice × decay
 * OFI = (buyFlow - sellFlow) / (buyFlow + sellFlow + ε)
 */
export class L4_OFI implements QuantLayer {
  name = 'L4_OFI'
  private readonly epsilon = 1

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const buyFlow = state.pendingBuyVolume * state.currentPrice
    const sellFlow = state.pendingSellVolume * state.currentPrice
    const totalFlow = buyFlow + sellFlow + this.epsilon

    const ofi = (buyFlow - sellFlow) / totalFlow
    const decay = params.ofiDecay ?? 0.91
    // L4 complementa L1 com decay por cluster
    const deltaPrice = ofi * (params.lambdaKyle * 0.5) * state.currentPrice * decay

    return {
      layer: this.name,
      deltaPrice,
      metadata: { ofi, buyFlow, sellFlow, decay },
    }
  }
}
