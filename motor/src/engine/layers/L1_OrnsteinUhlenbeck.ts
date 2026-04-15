import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L1 — Ornstein-Uhlenbeck (OU) — Componente Estocástica
 *
 * Implementa a componente aleatória do processo OU:
 *   ΔP_stochastic = σ × √dt × N(0,1) × P
 *
 * A componente determinística (mean reversion ao FV) fica em L2_FundamentalAnchor.
 * Separação consciente para evitar double-counting.
 *
 * σ é escalado por `state.dailySigmaMultiplier` (setado por L9_DailyVolTarget):
 *   - 1.0: operação normal
 *   - 0.5..1.0: exaustão de mercado (2.0%–2.5% de variação diária acumulada)
 *   - 0.0: freeze total de volatilidade (≥2.5% diário)
 *
 * dt = 1 tick = 1 segundo (configurável via MOTOR_TICK_DT_SECONDS)
 */
const DT = parseFloat(process.env.MOTOR_TICK_DT_SECONDS ?? '1')

export class L1_OrnsteinUhlenbeck implements QuantLayer {
  name = 'L1_OrnsteinUhlenbeck'

  applyLayer(state: AssetState, params: ClusterParams, noise: number): LayerResult {
    if (state.currentPrice === 0) {
      return { layer: this.name, deltaPrice: 0, metadata: { sigmaEff: 0 } }
    }

    const sigma = params.sigma ?? 0.001
    // dailySigmaMultiplier é setado por L9 no tick anterior (default 1.0)
    const sigmaEff = sigma * (state.dailySigmaMultiplier ?? 1.0)

    // Componente estocástica: σ_eff × √dt × N(0,1) × P
    const deltaPrice = sigmaEff * Math.sqrt(DT) * noise * state.currentPrice

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        sigma,
        sigmaEff,
        sigmaMultiplier: state.dailySigmaMultiplier ?? 1.0,
        noise,
        dt: DT,
      },
    }
  }
}
