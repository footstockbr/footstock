import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L6 — Supply Scaling — Amplificação por Escassez de Float
 *
 * Amplifica o impacto de drift conforme o float disponível diminui.
 * Quando poucos cotas estão disponíveis para negociação, qualquer pressão
 * adicional tem impacto desproporcional (modelo de scarcity premium).
 *
 * Fórmula (INTAKE canônico):
 *   float_available_ratio = max(0, 1 − volume / (k × baseVolume))
 *   amplifier = 1 + (1 − float_available_ratio) × max_amplification
 *
 *   k = múltiplo de sessão por cluster (quantos períodos de baseVolume = float total)
 *   max_amplification = 1.0 → amplifier ∈ [1.0, 2.0]
 *
 *   Quando float = 100%: amplifier = 1.0 (impacto normal)
 *   Quando float < 20%: amplifier ≈ 2.0 (impacto máximo)
 *
 * Implementação: `state.volume` é proxy de consumo intra-sessão do float disponível.
 * Não modela float absoluto (dados reais de posições abertas não disponíveis em tempo real).
 */

const DEFAULT_AMP_CAP = 2.0  // amplificador total máximo: 2×

/** k por cluster: quantos × baseVolume para consumir o float estimado na sessão */
const FLOAT_K: Record<string, number> = {
  A_TOP:    20,   // Grandes clubes: float amplo
  A_MID:    15,
  A_SMALL:  10,
  B_LIQUID:  8,
  B_ILLIQ:   5,   // Pequenos: float se esgota rápido
}

export class L6_SupplyScaling implements QuantLayer {
  name = 'L6_SupplyScaling'

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const k = FLOAT_K[state.cluster] ?? 10
    const capacity = k * params.baseVolume

    // Ratio de float disponível: decresce conforme volume cresce
    const floatAvailableRatio = capacity > 0
      ? Math.max(0, 1 - state.volume / capacity)
      : 0

    const ampCap = params.supplyAmpCap ?? DEFAULT_AMP_CAP
    const maxAmplification = Math.max(0, ampCap - 1)

    // amplifier = 1 + (1 − floatAvailableRatio) × maxAmplification
    // Quando float → 0: amplifier → 2 (dobra o impacto)
    const amplification = 1 + (1 - floatAvailableRatio) * maxAmplification

    const deltaPrice = params.drift * state.currentPrice * amplification

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        drift: params.drift,
        floatAvailableRatio,
        amplification,
        ampCap,
        volume: state.volume,
        capacity,
      },
    }
  }
}
