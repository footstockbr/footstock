import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L9 — Daily Vol Target — Meta de Volatilidade Diária
 *
 * Controla a volatilidade acumulada intra-dia e aplica progressivamente
 * redução de sigma quando o alvo de 2.5% diário é aproximado.
 *
 * Comportamento (INTAKE canônico):
 *   - acumulado < 2.0%: operação normal (sigmaMultiplier = 1.0)
 *   - 2.0% ≤ acumulado < 2.5%: redução gradual de sigma (exaustão de mercado)
 *     sigmaMultiplier = 1.0 − progress × 0.8  (reduz até 20% do sigma original)
 *   - acumulado ≥ 2.5%: freeze de deltas de volatilidade (sigmaMultiplier = 0.0)
 *     Apenas L1_OU (âncora determinística) e L2_FundamentalAnchor continuam.
 *
 * Nota: sigmaMultiplier é lido por L1_OrnsteinUhlenbeck e L3_GARCHLite no tick seguinte.
 * Há lag de 1 tick por design — correto para séries temporais discretas.
 *
 * Persistência: `state.dailyVolAccum` é a fonte de verdade em memória.
 * Redis backup: `daily_vol:{ticker}:{date}` com TTL 25h — hydratado pelo MarketEngine.
 *
 * Reset: na transição para sessão PRE_OPENING (início do dia de negociação).
 * Operação: `PriceCalculator.resetDailyVolTarget()` chamado pelo MarketEngine.
 */

const SIGMA_REDUCTION_START = 0.020   // 2.0%: começa redução de sigma
const FREEZE_THRESHOLD      = 0.025   // 2.5%: freeze total de volatilidade
const SIGMA_REDUCTION_RANGE = FREEZE_THRESHOLD - SIGMA_REDUCTION_START  // 0.5%
const MIN_SIGMA_MULTIPLIER  = 0.20    // mínimo durante exaustão (20% do sigma original)

export class L9_DailyVolTarget implements QuantLayer {
  name = 'L9_DailyVolTarget'

  /**
   * applyLayer: atualiza state.dailySigmaMultiplier com base no vol acumulado ATUAL.
   * Retorna deltaPrice = 0 (L9 é um modificador, não gera delta direto).
   */
  applyLayer(state: AssetState, _params: ClusterParams, _noise: number): LayerResult {
    const dailyVol = state.dailyVolAccum ?? 0

    let sigmaMultiplier: number
    let frozen = false

    if (dailyVol >= FREEZE_THRESHOLD) {
      // Freeze: apenas L1/L2 operam (via sigmaMultiplier=0 em L1 e L3)
      sigmaMultiplier = 0.0
      frozen = true
    } else if (dailyVol >= SIGMA_REDUCTION_START) {
      // Exaustão gradual: progresso de 0 a 1 entre 2.0% e 2.5%
      const progress = (dailyVol - SIGMA_REDUCTION_START) / SIGMA_REDUCTION_RANGE
      // Reduz de 1.0 até MIN_SIGMA_MULTIPLIER
      sigmaMultiplier = 1.0 - progress * (1.0 - MIN_SIGMA_MULTIPLIER)
    } else {
      sigmaMultiplier = 1.0
    }

    // Atualizar multiplicador para uso no próximo tick por L1 e L3
    state.dailySigmaMultiplier = sigmaMultiplier

    return {
      layer: this.name,
      deltaPrice: 0,
      metadata: {
        dailyVol,
        sigmaMultiplier,
        frozen: frozen ? 1 : 0,
        reductionStartAt: SIGMA_REDUCTION_START,
        freezeAt: FREEZE_THRESHOLD,
      },
    }
  }

  /**
   * Acumula variação fracional do tick corrente no estado diário.
   * Deve ser chamado pelo PriceCalculator APÓS calcular o delta final.
   *
   * @param state     Estado do ativo
   * @param deltaFrac Variação fracional absoluta: |delta| / currentPrice
   */
  accumulate(state: AssetState, deltaFrac: number): void {
    state.dailyVolAccum = (state.dailyVolAccum ?? 0) + Math.abs(deltaFrac)
  }

  /**
   * Reset para nova sessão PRE_OPENING.
   * Chamado pelo MarketEngine na transição de sessão.
   */
  resetForSession(state: AssetState): void {
    state.dailyVolAccum = 0
    state.dailySigmaMultiplier = 1.0
  }
}
