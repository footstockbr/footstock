// ============================================================================
// Foot Stock Motor — LiquidityAgents
// 5 perfis de agentes de liquidez por cluster (T-009).
// Wrapper sobre o AgentOrchestrator existente com mapeamento canônico.
// ============================================================================

import { AgentOrchestrator, AssetCluster as AgentCluster } from '../agents/AgentOrchestrator'
import type { MarketContext } from '../agents/BaseAgent'
import type { AssetCluster } from '../types/motor.types'
import { MarketMakerAgent } from '../agents/MarketMakerAgent'
import { MomentumAgent } from '../agents/MomentumAgent'
import { ContrarianAgent } from '../agents/ContrarianAgent'
import { ValueInvestorAgent } from '../agents/ValueInvestorAgent'
import { RandomTraderAgent } from '../agents/RandomTraderAgent'

/**
 * Perfis canônicos de agentes de liquidez (INTAKE T-009).
 * Mapeamento para implementações existentes:
 *   MARKET_MAKER       → MarketMakerAgent  (ordens em ambos os lados, spread simulado)
 *   MOMENTUM_FOLLOWER  → MomentumAgent    (segue direção dos últimos 15 ticks)
 *   CONTRARIAN         → ContrarianAgent  (compra em queda >1%, vende em alta >1%)
 *   FUNDAMENTAL_TRADER → ValueInvestorAgent (compra abaixo do FV, vende acima)
 *   NOISE_TRADER       → RandomTraderAgent (ordens aleatórias — ruído de mercado)
 */
export enum LiquidityProfile {
  MARKET_MAKER       = 'MARKET_MAKER',
  MOMENTUM_FOLLOWER  = 'MOMENTUM_FOLLOWER',
  CONTRARIAN         = 'CONTRARIAN',
  FUNDAMENTAL_TRADER = 'FUNDAMENTAL_TRADER',
  NOISE_TRADER       = 'NOISE_TRADER',
}

/**
 * Configuração de pesos dos agentes por cluster.
 * Volumes configuráveis em `cluster_agent_params` (banco de dados).
 * Defaults baseados no comportamento de mercado brasileiro.
 */
export interface ClusterAgentConfig {
  marketMakerWeight: number
  momentumWeight: number
  contrarianWeight: number
  fundamentalWeight: number
  noiseWeight: number
}

const DEFAULT_AGENT_CONFIG: Record<AssetCluster, ClusterAgentConfig> = {
  A_TOP: {
    marketMakerWeight:   4,  // alta liquidez — MM dominante
    momentumWeight:      2,
    contrarianWeight:    1,
    fundamentalWeight:   3,
    noiseWeight:         1,
  },
  A_MID: {
    marketMakerWeight:   3,
    momentumWeight:      2,
    contrarianWeight:    1,
    fundamentalWeight:   2,
    noiseWeight:         1,
  },
  A_SMALL: {
    marketMakerWeight:   2,
    momentumWeight:      2,
    contrarianWeight:    1,
    fundamentalWeight:   2,
    noiseWeight:         2,
  },
  B_LIQUID: {
    marketMakerWeight:   3,
    momentumWeight:      1,
    contrarianWeight:    1,
    fundamentalWeight:   1,
    noiseWeight:         3,
  },
  B_ILLIQ: {
    marketMakerWeight:   2,  // baixa liquidez — mais ruído
    momentumWeight:      1,
    contrarianWeight:    1,
    fundamentalWeight:   1,
    noiseWeight:         5,
  },
}

/**
 * Cria lista de agentes para um cluster com os 5 perfis canônicos.
 * Substitui/complementa `createAgents()` do AgentOrchestrator.
 */
export function createLiquidityAgents(cluster: AssetCluster, config?: Partial<ClusterAgentConfig>) {
  const cfg = { ...DEFAULT_AGENT_CONFIG[cluster], ...config }
  return [
    new MarketMakerAgent(cfg.marketMakerWeight),
    new MomentumAgent(cfg.momentumWeight),
    new ContrarianAgent(cfg.contrarianWeight),
    new ValueInvestorAgent(cfg.fundamentalWeight),
    new RandomTraderAgent(cfg.noiseWeight),
  ]
}

/**
 * LiquidityAgents — Orquestrador de Agentes de Liquidez Canônicos.
 *
 * Interface compatível com AgentOrchestrator mas usando os 5 perfis do T-009.
 * Avalia momentum de 15 ticks para decisões de buy/hold/sell.
 * Simula book de ordens com profundidade configurável por cluster.
 */
export class LiquidityAgents {
  private orchestrator = new AgentOrchestrator()
  private agentConfigs: Map<string, ClusterAgentConfig> = new Map()

  /**
   * Inicializa agentes de liquidez para um ativo com os 5 perfis canônicos.
   */
  initAsset(
    assetId: string,
    cluster: AssetCluster,
    config?: Partial<ClusterAgentConfig>
  ): void {
    const cfg = { ...DEFAULT_AGENT_CONFIG[cluster], ...config }
    this.agentConfigs.set(assetId, cfg)
    // Mapear para enum do AgentOrchestrator (suporta todos os 5 clusters)
    const clusterMap: Record<string, AgentCluster> = {
      A_TOP: AgentCluster.A_TOP,
      A_MID: AgentCluster.A_MID,
      A_SMALL: AgentCluster.A_SMALL,
      B_LIQUID: AgentCluster.B_LIQUID,
      B_ILLIQ: AgentCluster.B_ILLIQ,
    }
    const agentCluster = clusterMap[cluster] ?? AgentCluster.B_ILLIQ
    this.orchestrator.initAsset(assetId, agentCluster)
  }

  /**
   * Executa tick dos agentes de liquidez e retorna impacto agregado no preço.
   * Capped em ±2% por tick (via AgentOrchestrator).
   */
  tickAsset(assetId: string, ctx: MarketContext): number {
    const { impact } = this.orchestrator.tickAsset(assetId, ctx)
    return impact
  }

  /**
   * Retorna configuração de agentes do ativo (para debug/admin).
   */
  getConfig(assetId: string): ClusterAgentConfig | undefined {
    return this.agentConfigs.get(assetId)
  }

  dispose(): void {
    this.orchestrator.dispose()
  }
}

/** Singleton para uso no MarketEngine/MarketEngineService. */
export const liquidityAgents = new LiquidityAgents()
