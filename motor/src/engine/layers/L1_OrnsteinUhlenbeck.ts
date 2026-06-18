import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'
import { getTickDt } from '../tick-dt'

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
 * dt = escala temporal do tick, resolvida de forma EXPLÍCITA por `getTickDt()`
 * (T3.3): default-safe legacy 5/390, ou `MOTOR_TICK_DT_SECONDS`/flag de
 * recalibração. Lido por tick (não congelado em module-scope) para auditoria.
 */
export class L1_OrnsteinUhlenbeck implements QuantLayer {
  name = 'L1_OrnsteinUhlenbeck'

  applyLayer(state: AssetState, params: ClusterParams, noise: number): LayerResult {
    if (state.currentPrice === 0) {
      return { layer: this.name, deltaPrice: 0, metadata: { sigmaEff: 0 } }
    }

    const dt = getTickDt()
    const sigma = params.sigma ?? 0.001
    // dailySigmaMultiplier é setado por L9 no tick anterior (default 1.0)
    // volatilityMultiplier é setado por SessionManager a cada tick (CLOSED=0, TRADING=1.0, etc.)
    const sessionMul = state.volatilityMultiplier ?? 1.0
    const dailyMul = state.dailySigmaMultiplier ?? 1.0
    const sigmaEff = sigma * dailyMul * sessionMul

    // Componente estocástica: σ_eff × √dt × N(0,1) × P
    const deltaPrice = sigmaEff * Math.sqrt(dt) * noise * state.currentPrice

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        sigma,
        sigmaEff,
        dailySigmaMultiplier: dailyMul,
        volatilityMultiplier: sessionMul,
        noise,
        dt,
      },
    }
  }
}
