// ============================================================================
// Foot Stock Motor — Parâmetros de Microestrutura por Cluster
// ============================================================================

import type { AssetCluster, ClusterParams } from '../types/motor.types'

export const CLUSTER_PARAMS: Record<AssetCluster, ClusterParams> = {
  A_TOP: {
    cluster: 'A_TOP',
    baseVolume: 50_000,
    drift: 0.0,
    garchAlpha: 0.08,
    garchBeta: 0.90,
    lambdaKyle: 0.0001,
    spread: 0.0005,
    maxTickChange: 0.02,    // max 2% por tick
  },
  A_MID: {
    cluster: 'A_MID',
    baseVolume: 20_000,
    drift: 0.0,
    garchAlpha: 0.10,
    garchBeta: 0.88,
    lambdaKyle: 0.0002,
    spread: 0.001,
    maxTickChange: 0.025,
  },
  A_SMALL: {
    cluster: 'A_SMALL',
    baseVolume: 8_000,
    drift: 0.0,
    garchAlpha: 0.15,
    garchBeta: 0.83,
    lambdaKyle: 0.0005,
    spread: 0.002,
    maxTickChange: 0.03,
  },
  B_LIQUID: {
    cluster: 'B_LIQUID',
    baseVolume: 3_000,
    drift: -0.0002,          // leve pressão vendedora
    garchAlpha: 0.20,
    garchBeta: 0.78,
    lambdaKyle: 0.001,
    spread: 0.005,
    maxTickChange: 0.04,
  },
  B_ILLIQ: {
    cluster: 'B_ILLIQ',
    baseVolume: 500,
    drift: -0.0005,          // pressão vendedora mais forte
    garchAlpha: 0.25,
    garchBeta: 0.73,
    lambdaKyle: 0.003,
    spread: 0.015,
    maxTickChange: 0.05,    // max 5% por tick (mais volátil)
  },
}

export function getClusterParams(cluster: string): ClusterParams {
  const params = CLUSTER_PARAMS[cluster as AssetCluster]
  if (!params) {
    console.warn(`[clusters] Cluster desconhecido: ${cluster}. Usando A_SMALL como fallback.`)
    return CLUSTER_PARAMS.A_SMALL
  }
  return params
}
