import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L3 — GARCH Lite — Volatilidade Condicional Heteroscedástica
 *
 * Implementa GARCH(1,1) com parâmetros canônicos:
 *   Var_t = ω + α × r²_{t-1} + β × Var_{t-1}
 *   ω = 0.000002, α = 0.12, β = 0.85
 *
 * Cap: variância condicional ≤ 1.8× a variância base (0.0001).
 * Inicialização: Var_0 = sigma_base² do cluster (na primeira execução).
 *
 * Persistência (Redis): `garch:var:{ticker}` com TTL 2h.
 * Hydratação: ao iniciar, MarketEngine carrega variance do Redis se disponível.
 * O estado `state.variance` é a fonte de verdade em memória.
 *
 * σ_eff = √Var_t × dailySigmaMultiplier (de L9_DailyVolTarget).
 * Quando dailySigmaMultiplier = 0.0: freeze total, GARCH não emite ruído.
 */
const DEFAULT_OMEGA = 0.000002  // INTAKE canônico
const BASE_VARIANCE = 0.0001    // Variância base para cap
const DEFAULT_VOLATILITY_CAP = 1.8      // Max 1.8× variância base

export class L3_GARCHLite implements QuantLayer {
  name = 'L3_GARCHLite'

  applyLayer(state: AssetState, params: ClusterParams, noise: number): LayerResult {
    const { garchAlpha, garchBeta } = params

    // Inicialização: se variance não foi setada (0 ou muito pequena), usar sigma_base²
    const sigmaBase = params.sigma ?? 0.001
    const variance0 = sigmaBase ** 2
    const prevVariance = state.variance > 0 ? state.variance : variance0

    // Retorno do tick anterior: (P - closePrice) / closePrice
    const lastReturn = state.closePrice > 0
      ? (state.currentPrice - state.closePrice) / state.closePrice
      : 0

    const omega = params.garchOmega ?? DEFAULT_OMEGA
    const volatilityCap = params.garchVolCap ?? DEFAULT_VOLATILITY_CAP
    const maxVariance = BASE_VARIANCE * volatilityCap

    // GARCH(1,1): Var_t = ω + α×r²_{t-1} + β×Var_{t-1}
    let newVariance = omega + garchAlpha * lastReturn ** 2 + garchBeta * prevVariance
    newVariance = Math.min(newVariance, maxVariance)

    // Persistir variância no estado (hydratado do Redis pelo MarketEngine no startup)
    state.variance = newVariance

    const sigma = Math.sqrt(newVariance)
    // dailySigmaMultiplier: 1.0 normal, 0..1 exaustão, 0.0 freeze
    // volatilityMultiplier: sessão (CLOSED=0, PRE_OPENING=0.3, TRADING=1.0, etc.)
    const dailyMul = state.dailySigmaMultiplier ?? 1.0
    const sessionMul = state.volatilityMultiplier ?? 1.0
    const sigmaEff = sigma * dailyMul * sessionMul

    const deltaPrice = sigmaEff * noise * state.currentPrice

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        sigma,
        sigmaEff,
        dailySigmaMultiplier: dailyMul,
        volatilityMultiplier: sessionMul,
        variance: newVariance,
        lastReturn,
        omega,
        volatilityCap,
        capped: newVariance >= maxVariance ? 1 : 0,
      },
    }
  }
}
