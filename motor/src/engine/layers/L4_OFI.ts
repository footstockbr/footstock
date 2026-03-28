import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L4 - Order Flow Imbalance (OFI)
 * Versão mais granular do L1, considera o fluxo líquido de ordens
 * no book durante o último período.
 *
 * Formula: Δp = OFI × λ × currentPrice
 * OFI = (buyFlow - sellFlow) / (buyFlow + sellFlow + ε)
 */
export class L4_OFI implements QuantLayer {
  name = 'L4_OFI'
  private readonly epsilon = 1  // Evitar divisão por zero

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const buyFlow = state.pendingBuyVolume * state.currentPrice
    const sellFlow = state.pendingSellVolume * state.currentPrice
    const totalFlow = buyFlow + sellFlow + this.epsilon

    const ofi = (buyFlow - sellFlow) / totalFlow
    // L4 usa metade da força de L1 (complementar)
    const deltaPrice = ofi * (params.lambdaKyle * 0.5) * state.currentPrice

    return {
      layer: this.name,
      deltaPrice,
      metadata: { ofi, buyFlow, sellFlow },
    }
  }
}
