import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L5 — Kyle's Lambda — Impacto de Mercado por Tamanho de Ordem
 *
 * Impacto permanente de preço proporcional ao volume negociado.
 * Simula o custo de impacto de mercado de grandes ordens (Kyle 1985).
 *
 * Fórmula: Δp = λ × (volume_traded / available_liquidity) × P × sign(side) × asymmetry
 *
 * Assimetria (INTAKE canônico): compras grandes sobem mais que vendas baixam.
 * Razão microestrutural: adverse selection assimétrica — compradores revelam
 * informação positiva com maior intensidade do que vendedores revelam negativa.
 *
 * Fatores de assimetria por cluster (calibrados para manter impacto < 0.35%/tick):
 *   A_TOP:    1.08 (mercado profundo — assimetria menor)
 *   A_MID:    1.07
 *   A_SMALL:  1.06
 *   B_LIQUID: 1.05
 *   B_ILLIQ:  1.05 (mercado raso — não amplificar além do necessário)
 */

const BUY_ASYMMETRY: Record<string, number> = {
  A_TOP:    1.08,
  A_MID:    1.07,
  A_SMALL:  1.06,
  B_LIQUID: 1.05,
  B_ILLIQ:  1.05,
}
const SELL_ASYMMETRY = 1.0  // vendas sem assimetria adicional

export class L5_KyleLambda implements QuantLayer {
  name = 'L5_KyleLambda'

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const totalVolume = state.pendingBuyVolume + state.pendingSellVolume
    if (totalVolume === 0) {
      return {
        layer: this.name,
        deltaPrice: 0,
        metadata: { volumeRatio: 0, lambda: params.lambdaKyle },
      }
    }

    const isBuyDominant = state.pendingBuyVolume >= state.pendingSellVolume
    const netSign      = isBuyDominant ? 1 : -1
    const asymmetry    = isBuyDominant
      ? (BUY_ASYMMETRY[state.cluster] ?? 1.05)
      : SELL_ASYMMETRY

    // available_liquidity = baseVolume (proxy para profundidade do book simulado)
    const volumeRatio  = totalVolume / params.baseVolume
    const deltaPrice   = params.lambdaKyle * volumeRatio * state.currentPrice * netSign * asymmetry

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        volumeRatio,
        lambda: params.lambdaKyle,
        asymmetry,
        isBuyDominant: isBuyDominant ? 1 : 0,
      },
    }
  }
}
