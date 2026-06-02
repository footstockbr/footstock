// ============================================================================
// FootStock Motor — CorrelationLayer
// Correlação inter-ativos por cluster + regional (extraída de PriceCalculator).
// ============================================================================

import type { AssetState, AssetCluster, PreviousTickDelta } from '../types/motor.types'

/**
 * Rho de correlação por cluster (INTAKE canônico — T-009).
 * Ativos do mesmo cluster se movem parcialmente juntos.
 * Clusters diferentes NÃO são correlacionados entre si.
 */
const CLUSTER_RHO: Record<AssetCluster, number> = {
  A_TOP:    0.35,  // A_grande
  A_MID:    0.15,  // A_medio
  A_SMALL:  0.08,  // A_pequeno
  B_LIQUID: 0.05,  // B_liquido
  B_ILLIQ:  0.05,  // B_iliquido
}

/** Rho adicional para clubes do mesmo estado (correlação regional). */
const REGIONAL_RHO = 0.10

/** Cap do delta de correlação: máx 20% do maxTickChange para evitar cascata. */
const CORRELATION_CAP_PERCENT = 0.0007  // ~20% de 0.35%

export interface CorrelationResult {
  delta: number
  clusterRho: number
  regionalRho: number
  clusterPeers: number
  regionalPeers: number
}

export class CorrelationLayer {
  /**
   * Calcula o delta de correlação inter-ativos para um ativo específico.
   *
   * Fórmula (INTAKE canônico):
   *   final_delta_i = (1 − rho_cluster) × delta_i + rho_cluster × avg_delta_cluster
   *
   * Implementação: calcula o AJUSTE de correlação (delta adicional):
   *   corrDelta = rho_cluster × avgPeerDelta + rho_regional × avgRegionalDelta
   *
   * @param state          Estado do ativo atual
   * @param previousDeltas Deltas percentuais do tick anterior de todos os ativos
   */
  compute(
    state: AssetState,
    previousDeltas: Map<string, PreviousTickDelta>
  ): CorrelationResult {
    const rhoCluster = CLUSTER_RHO[state.cluster] ?? 0

    const clusterPeerDeltas: number[] = []
    const regionalPeerDeltas: number[] = []

    for (const [id, delta] of previousDeltas) {
      // Excluir o próprio ativo
      if (id === state.id) continue

      // Correlação por cluster: só mesmo cluster (não mistura clusters)
      if (delta.cluster === state.cluster) {
        clusterPeerDeltas.push(delta.deltaPercent)
      }

      // Correlação regional: mesmo estado (UF)
      if (state.state !== '' && delta.state === state.state) {
        regionalPeerDeltas.push(delta.deltaPercent)
      }
    }

    let corrDelta = 0

    if (clusterPeerDeltas.length > 0) {
      const avgClusterDelta = clusterPeerDeltas.reduce((a, b) => a + b, 0) / clusterPeerDeltas.length
      corrDelta += rhoCluster * avgClusterDelta * state.currentPrice
    }

    if (regionalPeerDeltas.length > 0) {
      const avgRegionalDelta = regionalPeerDeltas.reduce((a, b) => a + b, 0) / regionalPeerDeltas.length
      corrDelta += REGIONAL_RHO * avgRegionalDelta * state.currentPrice
    }

    // Velocity cap na correlação: evitar cascata entre ativos
    const maxCorrDelta = state.currentPrice * CORRELATION_CAP_PERCENT
    const cappedDelta  = Math.max(-maxCorrDelta, Math.min(maxCorrDelta, corrDelta))

    return {
      delta: cappedDelta,
      clusterRho: rhoCluster,
      regionalRho: regionalPeerDeltas.length > 0 ? REGIONAL_RHO : 0,
      clusterPeers: clusterPeerDeltas.length,
      regionalPeers: regionalPeerDeltas.length,
    }
  }
}

/** Singleton para uso no PriceCalculator. */
export const correlationLayer = new CorrelationLayer()
