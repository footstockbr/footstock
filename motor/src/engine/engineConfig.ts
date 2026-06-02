// ============================================================================
// FootStock Motor — engineConfig
// Parâmetros por cluster lidos do banco (hot-reload sem restart do servidor).
// ============================================================================

import type { PrismaClient } from '@prisma/client'
import type { AssetCluster, ClusterParams } from '../types/motor.types'
import { CLUSTER_PARAMS } from '../microstructure/clusters'
import { logger } from '../utils/logger'

/** TTL do cache em memória: 60s (reload automático do DB sem restart). */
const CACHE_TTL_MS = 60_000

interface CacheEntry {
  params: ClusterParams
  loadedAt: number
}

/**
 * EngineConfig — Leitor de parâmetros por cluster com hot-reload do banco.
 *
 * Comportamento:
 *   1. Tenta carregar do banco via Prisma (tabela `cluster_params` se existir).
 *   2. Se não encontrar, usa os defaults hardcoded de `clusters.ts`.
 *   3. Cache em memória com TTL de 60s — sem restart para atualizar parâmetros.
 *
 * Sem a tabela `cluster_params` no banco: opera 100% com defaults (seguro).
 * Todos os parâmetros são mutáveis sem restart do servidor (hot reload).
 */
export class EngineConfig {
  private cache: Map<AssetCluster, CacheEntry> = new Map()
  private prisma: PrismaClient | null = null

  /**
   * Injeta cliente Prisma para hot-reload do banco.
   * Se não injetado, opera apenas com defaults.
   */
  setPrisma(prisma: PrismaClient): void {
    this.prisma = prisma
  }

  /**
   * Retorna parâmetros do cluster.
   * Cache-first com TTL 60s; fallback para defaults se banco indisponível.
   */
  async getParams(cluster: AssetCluster): Promise<ClusterParams> {
    const cached = this.cache.get(cluster)
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.params
    }

    // Tentar carregar do banco
    if (this.prisma) {
      try {
        // @ts-ignore — tabela opcional; pode não existir em todos os projetos
        const row = await this.prisma.clusterParams?.findUnique({
          where: { cluster }
        })
        if (row) {
          const params = this._mapRow(cluster, row)
          this.cache.set(cluster, { params, loadedAt: Date.now() })
          return params
        }
      } catch {
        // Tabela não existe ou erro de acesso — fallback para defaults
      }
    }

    // Fallback: defaults hardcoded
    const defaults = CLUSTER_PARAMS[cluster] ?? CLUSTER_PARAMS.A_SMALL
    this.cache.set(cluster, { params: defaults, loadedAt: Date.now() })
    return defaults
  }

  /**
   * Força reload do cache para um cluster específico (chamado após admin atualiza parâmetros).
   */
  invalidate(cluster?: AssetCluster): void {
    if (cluster) {
      this.cache.delete(cluster)
    } else {
      this.cache.clear()
    }
    logger.info(`[engineConfig] Cache invalidado: ${cluster ?? 'todos os clusters'}`)
  }

  /**
   * Retorna parâmetros síncrono (sem banco) — usa cache ou defaults.
   * Para uso em hot paths onde async não é viável.
   */
  getParamsSync(cluster: AssetCluster): ClusterParams {
    const cached = this.cache.get(cluster)
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.params
    }
    return CLUSTER_PARAMS[cluster] ?? CLUSTER_PARAMS.A_SMALL
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _mapRow(cluster: AssetCluster, row: any): ClusterParams {
    return {
      cluster,
      baseVolume:   Number(row.baseVolume   ?? CLUSTER_PARAMS[cluster].baseVolume),
      drift:        Number(row.drift        ?? CLUSTER_PARAMS[cluster].drift),
      theta:        Number(row.theta        ?? CLUSTER_PARAMS[cluster].theta),
      sigma:        Number(row.sigma        ?? CLUSTER_PARAMS[cluster].sigma),
      garchAlpha:   Number(row.garchAlpha   ?? CLUSTER_PARAMS[cluster].garchAlpha),
      garchBeta:    Number(row.garchBeta    ?? CLUSTER_PARAMS[cluster].garchBeta),
      lambdaKyle:   Number(row.lambdaKyle   ?? CLUSTER_PARAMS[cluster].lambdaKyle),
      spread:       Number(row.spread       ?? CLUSTER_PARAMS[cluster].spread),
      maxTickChange:Number(row.maxTickChange ?? CLUSTER_PARAMS[cluster].maxTickChange),
      ofiDecay:     Number(row.ofiDecay     ?? CLUSTER_PARAMS[cluster].ofiDecay),
      alphaOfi:     Number(row.alphaOfi     ?? CLUSTER_PARAMS[cluster].alphaOfi),
    }
  }
}

/** Singleton do motor. */
export const engineConfig = new EngineConfig()
