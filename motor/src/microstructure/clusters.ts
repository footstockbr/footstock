// ============================================================================
// FootStock Motor — Parâmetros de Microestrutura por Cluster
// ============================================================================

import type { AssetCluster, ClusterParams } from '../types/motor.types'

export const CLUSTER_PARAMS: Record<AssetCluster, ClusterParams> = {
  A_TOP: {
    cluster: 'A_TOP',
    baseVolume: 50_000,
    drift: 0.0,
    theta: 0.12,              // INTAKE: OU reversion speed
    sigma: 0.0018,            // INTAKE canônico: OU volatility (ex: URU3)
    garchAlpha: 0.12,         // INTAKE canônico
    garchBeta: 0.85,          // INTAKE canônico
    lambdaKyle: 0.0001,
    spread: 0.0005,
    maxTickChange: 0.0035,    // INTAKE: 0.35% por tick
    ofiDecay: 0.91,           // INTAKE: decay A_TOP
    alphaOfi: 0.0003,         // Impacto OFI: baixo (alta liquidez)
  },
  A_MID: {
    cluster: 'A_MID',
    baseVolume: 20_000,
    drift: 0.0,
    theta: 0.18,              // INTAKE canônico: 0.18
    sigma: 0.0025,            // INTAKE canônico: 0.0025
    garchAlpha: 0.12,
    garchBeta: 0.85,
    lambdaKyle: 0.0002,
    spread: 0.001,
    maxTickChange: 0.0035,
    ofiDecay: 0.93,
    alphaOfi: 0.0005,         // Impacto OFI: médio
  },
  A_SMALL: {
    cluster: 'A_SMALL',
    baseVolume: 8_000,
    drift: 0.0,
    theta: 0.08,
    sigma: 0.0032,            // INTAKE canônico: 0.0032
    garchAlpha: 0.12,
    garchBeta: 0.85,
    lambdaKyle: 0.0005,
    spread: 0.002,
    maxTickChange: 0.0035,
    ofiDecay: 0.95,
    alphaOfi: 0.0008,         // Impacto OFI: médio-alto
  },
  B_LIQUID: {
    cluster: 'B_LIQUID',
    baseVolume: 3_000,
    drift: 0,                 // Fix D: drift estrutural removido — pressão vendedora permanente causava sangria contínua
    theta: 0.23,              // INTAKE canônico: 0.23
    sigma: 0.0035,
    garchAlpha: 0.12,
    garchBeta: 0.85,
    lambdaKyle: 0.001,
    spread: 0.005,
    maxTickChange: 0.0035,
    ofiDecay: 0.96,
    alphaOfi: 0.0012,         // Impacto OFI: alto
  },
  B_ILLIQ: {
    cluster: 'B_ILLIQ',
    baseVolume: 500,
    drift: 0,                 // Fix D: drift estrutural removido — pressão vendedora permanente causava sangria contínua
    theta: 0.25,              // INTAKE canônico: 0.25
    sigma: 0.0040,            // INTAKE canônico: 0.0040
    garchAlpha: 0.12,
    garchBeta: 0.85,
    lambdaKyle: 0.003,
    spread: 0.015,
    maxTickChange: 0.0035,
    ofiDecay: 0.97,           // INTAKE: decay B_ILLIQ
    alphaOfi: 0.0020,         // Impacto OFI: muito alto (ilíquido)
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
