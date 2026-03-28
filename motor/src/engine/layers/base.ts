import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

export interface QuantLayer {
  name: string
  applyLayer(state: AssetState, params: ClusterParams, noise: number): LayerResult
}
