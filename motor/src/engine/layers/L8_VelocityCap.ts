import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L8 - Velocity Cap
 * Limita a variação máxima por tick de acordo com o cluster.
 * Não contribui com deltaPrice como camada direta —
 * a limitação ocorre no PriceCalculator após somar L1-L7.
 */
export class L8_VelocityCap implements QuantLayer {
  name = 'L8_VelocityCap'

  applyLayer(_state: AssetState, _params: ClusterParams, _noise: number): LayerResult {
    return { layer: this.name, deltaPrice: 0 }
  }

  /**
   * Aplica o cap no deltaPrice total acumulado.
   * Chamado pelo PriceCalculator após somar L1-L7.
   */
  applyCap(totalDelta: number, currentPrice: number, maxTickChange: number): number {
    const maxChange = currentPrice * maxTickChange
    return Math.max(-maxChange, Math.min(maxChange, totalDelta))
  }
}
