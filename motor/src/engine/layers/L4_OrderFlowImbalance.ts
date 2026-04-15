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

    if (total === 0) {
      return { layer: this.name, deltaPrice: 0, metadata: { ofi: state.ofiState ?? 0 } }
    }

    // OFI raw: normalizado entre -1 e +1
    const ofiRaw = (buyVol - sellVol) / total

    // Decaimento exponencial por cluster
    const rho  = params.ofiDecay ?? 0.91
    const ofiT = rho * (state.ofiState ?? 0) + (1 - rho) * ofiRaw

    // Persistir OFI no estado (fonte de verdade em memória)
    state.ofiState = ofiT

    // Impacto: delta_OFI = alpha_ofi × OFI_t × P
    const alphaOfi = params.alphaOfi ?? 0.0005
    const deltaPrice = alphaOfi * ofiT * state.currentPrice

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
      },
    }
  }
}
