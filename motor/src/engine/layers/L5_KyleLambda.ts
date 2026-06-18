import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L5 — Kyle's Lambda — Impacto de Mercado por Tamanho de Ordem
 *
 * Impacto permanente de preço proporcional ao FLUXO LÍQUIDO direcional.
 * Simula o custo de impacto de mercado de grandes ordens (Kyle 1985).
 *
 * Fórmula: Δp = λ × (fluxo_líquido / available_liquidity) × P × sign(side) × asymmetry
 *
 * T2.4 — base do ratio = `abs(pendingBuy - pendingSell)` (fluxo líquido executável)
 * em vez de `pendingBuy + pendingSell` (volume bruto). Razão: o impacto de Kyle é
 * função da PRESSÃO DIRECIONAL líquida que move o preço, não do giro bruto do book.
 * Em book equilibrado (buy == sell) o fluxo líquido é ~0 e o impacto tende a 0 —
 * sem execução direcional não há impacto permanente. O modo legacy (`legacyBase`)
 * reproduz o bug pré-fix (base = buy + sell) só para o teste vermelho/verde.
 *
 * Assimetria (INTAKE canônico): compras grandes sobem um pouco mais que vendas
 * baixam — adverse selection assimétrica. Com a base já direcional (fluxo líquido),
 * a assimetria foi REDUZIDA para perto de 1.0 (era 1.05-1.08): a direcionalidade já
 * está capturada pelo sinal do fluxo, o multiplicador só inclina levemente a compra.
 *
 * Fatores de assimetria por cluster (parametrizados, mantidos > 1.0):
 *   A_TOP:    1.02 (mercado profundo — assimetria mínima)
 *   A_MID:    1.02
 *   A_SMALL:  1.015
 *   B_LIQUID: 1.01
 *   B_ILLIQ:  1.01 (mercado raso — não amplificar além do necessário)
 */

const BUY_ASYMMETRY: Record<string, number> = {
  A_TOP:    1.02,
  A_MID:    1.02,
  A_SMALL:  1.015,
  B_LIQUID: 1.01,
  B_ILLIQ:  1.01,
}
const SELL_ASYMMETRY = 1.0  // vendas sem assimetria adicional
const DEFAULT_BUY_ASYMMETRY = 1.01

export interface L5Options {
  /**
   * Reproduz o bug pré-fix (T2.4): base do ratio = `pendingBuy + pendingSell`
   * (volume bruto total) em vez do fluxo líquido `abs(pendingBuy - pendingSell)`.
   * Sob esse modo um book equilibrado (buy == sell) gera impacto NÃO-nulo — o
   * comportamento que o fix elimina. Default false (fluxo líquido corrigido).
   */
  legacyBase?: boolean
}

export class L5_KyleLambda implements QuantLayer {
  name = 'L5_KyleLambda'
  private readonly legacyBase: boolean

  constructor(opts: L5Options = {}) {
    this.legacyBase = opts.legacyBase === true
  }

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const buy  = state.pendingBuyVolume
    const sell = state.pendingSellVolume

    // T2.4: base = fluxo líquido direcional. Em book equilibrado (buy == sell) o
    // fluxo é 0 -> impacto 0 (sem execução direcional não há impacto permanente).
    const flow = this.legacyBase ? (buy + sell) : Math.abs(buy - sell)
    if (flow === 0) {
      return {
        layer: this.name,
        deltaPrice: 0,
        metadata: { volumeRatio: 0, lambda: params.lambdaKyle },
      }
    }

    const isBuyDominant = buy >= sell
    const netSign      = isBuyDominant ? 1 : -1
    const asymmetry    = isBuyDominant
      ? (BUY_ASYMMETRY[state.cluster] ?? DEFAULT_BUY_ASYMMETRY)
      : SELL_ASYMMETRY

    // available_liquidity = baseVolume (proxy para profundidade do book simulado)
    const volumeRatio  = flow / params.baseVolume
    const rawDeltaPrice = params.lambdaKyle * volumeRatio * state.currentPrice * netSign * asymmetry

    // T4.1 (loop 06-17): escala o impacto de mercado pelo multiplicador de SESSÃO
    // (volatilityMultiplier), mesmo idioma de L1_OU/L3_GARCHLite. Em janela de
    // freeze/dimmer o impacto cai na proporção do multiplicador; sessão normal (1.0)
    // é identidade. O freeze da L9 (dailySigmaMultiplier) permanece exclusivo de L1/L3.
    const sessionMul = state.volatilityMultiplier ?? 1.0
    const deltaPrice = rawDeltaPrice * sessionMul

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        volumeRatio,
        lambda: params.lambdaKyle,
        asymmetry,
        isBuyDominant: isBuyDominant ? 1 : 0,
        volatilityMultiplier: sessionMul,
        rawDeltaPrice,
      },
    }
  }
}
