import type { QuantLayer } from './base'
import type { AssetState, ClusterParams, LayerResult } from '../../types/motor.types'

/**
 * L4 — Order Flow Imbalance (OFI) com Decaimento Exponencial
 *
 * Captura a memória de pressão direcional do fluxo de ordens.
 * Fórmula com decaimento exponencial por cluster:
 *
 *   ofi_raw_t = (buy_vol − sell_vol) / (buy_vol + sell_vol)   ← janela de 1 tick
 *   OFI_t     = ρ × OFI_{t-1} + (1−ρ) × ofi_raw_t            ← EWMA com decay ρ
 *   ΔP        = alpha_ofi × OFI_t × P                         ← impacto no preço
 *
 * Valores de ρ por cluster (INTAKE canônico):
 *   A_grande (A_TOP):    ρ = 0.91  (dissipa rápido — alta liquidez)
 *   A_medio  (A_MID):    ρ = 0.93
 *   A_pequeno(A_SMALL):  ρ = 0.95
 *   B_liquido(B_LIQUID): ρ = 0.96
 *   B_iliquido(B_ILLIQ): ρ = 0.97  (persiste — baixa liquidez)
 *
 * Estado `state.ofiState` persiste o OFI_t entre ticks.
 * Hydratação: MarketEngine pode carregar ofiState do Redis `ofi:state:{ticker}`.
 *
 * Histórico OFI disponível via Redis `ofi:history:{ticker}` (lista circular 100 pontos)
 * para o sub-chart de OFI via `GET /api/v1/assets/:ticker/ofi-history`.
 */
export class L4_OrderFlowImbalance implements QuantLayer {
  name = 'L4_OrderFlowImbalance'

  applyLayer(state: AssetState, params: ClusterParams, _noise: number): LayerResult {
    const buyVol  = state.pendingBuyVolume
    const sellVol = state.pendingSellVolume
    const total   = buyVol + sellVol

    // Decaimento exponencial por cluster
    const rho = params.ofiDecay ?? 0.91

    // Sem ordens novas (total==0): o OFI ainda decai por memória — ofi_t = ρ × ofi_{t-1}.
    // Sem este decay o ofiState congelava no último valor (impacto e sub-chart nunca
    // convergiam a zero em janelas sem fluxo). Como ρ ∈ (0,1), o decaimento é monotônico
    // em módulo, converge a zero e nunca troca de sinal.
    if (total === 0) {
      const ofiT = rho * (state.ofiState ?? 0)
      state.ofiState = ofiT
      return { layer: this.name, deltaPrice: 0, metadata: { ofi: ofiT, ofiDecayed: ofiT, rho } }
    }

    // OFI raw: normalizado entre -1 e +1
    const ofiRaw = (buyVol - sellVol) / total

    const ofiT = rho * (state.ofiState ?? 0) + (1 - rho) * ofiRaw

    // Persistir OFI no estado (fonte de verdade em memória)
    state.ofiState = ofiT

    // Impacto: delta_OFI = alpha_ofi × OFI_t × P
    const alphaOfi = params.alphaOfi ?? 0.0005
    const rawDeltaPrice = alphaOfi * ofiT * state.currentPrice

    // T4.1 (loop 06-17): escala o IMPACTO no preço pelo multiplicador de SESSÃO
    // (volatilityMultiplier: CLOSED=0, AFTER_HOURS=0.10, TRADING=1.0, ...), mesmo
    // idioma de L1_OU/L3_GARCHLite (sessionMul). Em janela de freeze/dimmer o impacto
    // de fluxo cai na proporção do multiplicador; em sessão normal (1.0) é identidade.
    // A MEMÓRIA de OFI (state.ofiState) NÃO é escalada — só o delta de preço publicado.
    // O freeze da L9 (dailySigmaMultiplier) permanece EXCLUSIVO de L1/L3: não é aplicado
    // aqui, pois L4 é fluxo direcional, não volatilidade gaussiana.
    const sessionMul = state.volatilityMultiplier ?? 1.0
    const deltaPrice = rawDeltaPrice * sessionMul

    return {
      layer: this.name,
      deltaPrice,
      metadata: {
        ofiRaw,
        ofiDecayed: ofiT,
        rho,
        alphaOfi,
        buyVol,
        sellVol,
        volatilityMultiplier: sessionMul,
        rawDeltaPrice,
      },
    }
  }
}
