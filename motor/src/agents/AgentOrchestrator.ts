// ============================================================================
// Foot Stock Motor — AgentOrchestrator
// Orquestra agentes com proporções por cluster A_TOP e B_ILLIQ.
// Cap de impacto ±2% por tick para prevenir movimentos impossíveis.
// ============================================================================

import type { BaseAgent, AgentDecision, MarketContext } from './BaseAgent'
import { MarketMakerAgent } from './MarketMakerAgent'
import { MomentumAgent } from './MomentumAgent'
import { ContrarianAgent } from './ContrarianAgent'
import { ValueInvestorAgent } from './ValueInvestorAgent'
import { RandomTraderAgent } from './RandomTraderAgent'
import { PanicSellerAgent } from './PanicSellerAgent'
import { logger } from '../utils/logger'

export enum AssetCluster {
  A_TOP = 'A_TOP',
  A_MID = 'A_MID',
  A_SMALL = 'A_SMALL',
  B_LIQUID = 'B_LIQUID',
  B_ILLIQ = 'B_ILLIQ',
}

/** Cap de impacto agregado por tick: ±2% */
export const MAX_AGGREGATE_IMPACT = 0.02

/**
 * Cria a lista de agentes para o cluster especificado.
 * A_TOP:     40% MM + 30% Value + 20% Momentum + 10% mix (Contrarian/Random/Panic)
 * A_MID:     35% MM + 25% Value + 20% Momentum + 10% Contrarian + 10% Random
 * A_SMALL:   30% MM + 20% Value + 15% Momentum + 15% Random + 10% Contrarian + 10% Panic
 * B_LIQUID:  40% MM + 30% Random + 15% Momentum + 15% Panic
 * B_ILLIQ:   50% MM + 50% Random
 */
export function createAgents(cluster: AssetCluster): BaseAgent[] {
  switch (cluster) {
    case AssetCluster.A_TOP:
      return [
        new MarketMakerAgent(4),
        new ValueInvestorAgent(3),
        new MomentumAgent(2),
        new ContrarianAgent(1),
        new RandomTraderAgent(1),
        new PanicSellerAgent(1),
      ]
    case AssetCluster.A_MID:
      return [
        new MarketMakerAgent(4),
        new ValueInvestorAgent(3),
        new MomentumAgent(2),
        new ContrarianAgent(1),
        new RandomTraderAgent(1),
      ]
    case AssetCluster.A_SMALL:
      return [
        new MarketMakerAgent(3),
        new ValueInvestorAgent(2),
        new MomentumAgent(2),
        new RandomTraderAgent(2),
        new ContrarianAgent(1),
        new PanicSellerAgent(1),
      ]
    case AssetCluster.B_LIQUID:
      return [
        new MarketMakerAgent(4),
        new RandomTraderAgent(3),
        new MomentumAgent(2),
        new PanicSellerAgent(1),
      ]
    case AssetCluster.B_ILLIQ:
      return [
        new MarketMakerAgent(5),
        new RandomTraderAgent(5),
      ]
    default:
      throw new TypeError(`AssetCluster inválido: ${cluster}`)
  }
}

/**
 * Executa decide() em todos os agentes com try/catch individual.
 * Filtra HOLDs e retorna decisões válidas.
 */
export function runTick(agents: BaseAgent[], ctx: MarketContext): AgentDecision[] {
  const decisions: AgentDecision[] = []

  for (const agent of agents) {
    try {
      const decision = agent.decide(ctx)
      if (decision.side !== 'HOLD') {
        decisions.push(decision)
      }
    } catch (err) {
      logger.error(JSON.stringify({
        level: 'error',
        code: 'SYS_001',
        agent: agent.id,
        error: String(err),
      }))
      // HOLD implícito — outros agentes continuam
    }
  }

  return decisions
}

/**
 * Soma ponderada dos priceModifier * quantity com cap ±MAX_AGGREGATE_IMPACT.
 * Previne movimentos impossíveis em ativos ilíquidos.
 */
export function aggregateImpact(decisions: AgentDecision[]): number {
  let raw = 0
  for (const d of decisions) {
    const sign = d.side === 'BUY' ? 1 : -1
    // Math.abs: garante que `sign` controla a direção; evita que priceModifier
    // negativo em decisões de BUY inverta o impacto (pressão de compra → queda).
    raw += sign * Math.abs(d.priceModifier) * d.quantity
  }

  const capped = Math.max(-MAX_AGGREGATE_IMPACT, Math.min(MAX_AGGREGATE_IMPACT, raw))

  if (Math.abs(raw) > MAX_AGGREGATE_IMPACT) {
    logger.warn(JSON.stringify({
      level: 'warn',
      message: 'aggregateImpact capped',
      cappedFrom: raw,
      cappedTo: capped,
    }))
  }

  return capped
}

export interface TickResult {
  impact: number
  syntheticVolume: number
}

export class AgentOrchestrator {
  private agents: Map<string, BaseAgent[]> = new Map()

  /**
   * Inicializa agentes para um ativo específico.
   */
  initAsset(assetId: string, cluster: AssetCluster): void {
    this.agents.set(assetId, createAgents(cluster))
  }

  /**
   * Executa tick para um ativo e retorna impacto agregado + volume sintético.
   */
  tickAsset(assetId: string, ctx: MarketContext): TickResult {
    const agents = this.agents.get(assetId)
    if (!agents) return { impact: 0, syntheticVolume: 0 }

    const decisions = runTick(agents, ctx)
    const impact = aggregateImpact(decisions)
    const syntheticVolume = decisions.reduce((sum, d) => sum + d.quantity, 0)
    return { impact, syntheticVolume }
  }

  /**
   * Limpa recursos de todos os agentes — chamar no SIGTERM/SIGINT.
   */
  dispose(): void {
    this.agents.clear()
    logger.info('[AgentOrchestrator] dispose() — recursos liberados')
  }
}

/** Singleton compartilhado pelo motor */
export const agentOrchestrator = new AgentOrchestrator()
