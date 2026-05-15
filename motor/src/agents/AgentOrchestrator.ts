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

// Flag MOTOR_AGENT_COUNTS_V2 lida via process.env diretamente (sem importar
// `env` de '../config/env'): a importacao do modulo `env` dispara required()
// em REDIS_URL/DATABASE_URL no module-load, o que quebra a suite de testes de
// agents que nao precisa de Redis/DB. A declaracao canonica continua em
// motor/src/config/env.ts (default OFF em prod, ON em staging).
function isAgentCountsV2Enabled(): boolean {
  return process.env.MOTOR_AGENT_COUNTS_V2 === 'true'
}

export enum AssetCluster {
  A_TOP = 'A_TOP',
  A_MID = 'A_MID',
  A_SMALL = 'A_SMALL',
  B_LIQUID = 'B_LIQUID',
  B_ILLIQ = 'B_ILLIQ',
}

/** Cap de impacto agregado por tick: ±2% */
export const MAX_AGGREGATE_IMPACT = 0.02

// ============================================================================
// Matriz de contagens — V1 (legacy 2026-05-14) vs V2 (reducao ~50%).
// Gated pelo env MOTOR_AGENT_COUNTS_V2 (default OFF em prod, ON em staging).
//
// Task 008 do loop 05-14-foot-stock-motor-action-plan:
// reduzir contagens fixas em ~50% para aproximar o motor do volume produzido
// pelo legacy. Validacao: 48h de A/B em staging com monitoramento de
// ordens/h, spread medio por liquidez, CPU motor + Redis + Postgres writes/s,
// volatilidade nominal. Promover V2 a default ON e remover V1 apenas se OK.
//
// Regra de arredondamento: floor(n/2), com piso 1 para preservar a presenca
// de cada tipo de agente exigida pelos testes (`createAgents` deve manter
// MM/VAL/MOM/RandomTrader em A_TOP e MM/RAND em B_ILLIQ).
//
// Soma global por matriz:
//   V1 (LEGACY_AGENT_COUNTS_2026_05_14): 54 agentes
//   V2 (MOTOR_AGENT_COUNTS_V2):          28 agentes (-48%)
// ============================================================================

/** Contagens originais — manter ate promocao de V2 (ver task 008). */
export const LEGACY_AGENT_COUNTS_2026_05_14 = {
  A_TOP: { MM: 4, VAL: 3, MOM: 2, CONT: 1, RAND: 1, PANIC: 1 },
  A_MID: { MM: 4, VAL: 3, MOM: 2, CONT: 1, RAND: 1 },
  A_SMALL: { MM: 3, VAL: 2, MOM: 2, RAND: 2, CONT: 1, PANIC: 1 },
  B_LIQUID: { MM: 4, RAND: 3, MOM: 2, PANIC: 1 },
  B_ILLIQ: { MM: 5, RAND: 5 },
} as const

/** Contagens reduzidas ~50% — ativas quando MOTOR_AGENT_COUNTS_V2=true. */
export const AGENT_COUNTS_V2_2026_05 = {
  A_TOP: { MM: 2, VAL: 1, MOM: 1, CONT: 1, RAND: 1, PANIC: 1 },
  A_MID: { MM: 2, VAL: 1, MOM: 1, CONT: 1, RAND: 1 },
  A_SMALL: { MM: 1, VAL: 1, MOM: 1, RAND: 1, CONT: 1, PANIC: 1 },
  B_LIQUID: { MM: 2, RAND: 1, MOM: 1, PANIC: 1 },
  B_ILLIQ: { MM: 2, RAND: 2 },
} as const

/**
 * Cria a lista de agentes para o cluster especificado.
 *
 * Proporcoes V1 (legacy):
 *   A_TOP:     40% MM + 30% Value + 20% Momentum + 10% mix (Contrarian/Random/Panic)
 *   A_MID:     35% MM + 25% Value + 20% Momentum + 10% Contrarian + 10% Random
 *   A_SMALL:   30% MM + 20% Value + 15% Momentum + 15% Random + 10% Contrarian + 10% Panic
 *   B_LIQUID:  40% MM + 30% Random + 15% Momentum + 15% Panic
 *   B_ILLIQ:   50% MM + 50% Random
 *
 * V2 mantem as mesmas proporcoes relativas reduzindo cada contagem em ~50%.
 */
export function createAgents(cluster: AssetCluster): BaseAgent[] {
  const counts = isAgentCountsV2Enabled()
    ? AGENT_COUNTS_V2_2026_05
    : LEGACY_AGENT_COUNTS_2026_05_14

  switch (cluster) {
    case AssetCluster.A_TOP: {
      const c = counts.A_TOP
      return [
        new MarketMakerAgent(c.MM),
        new ValueInvestorAgent(c.VAL),
        new MomentumAgent(c.MOM),
        new ContrarianAgent(c.CONT),
        new RandomTraderAgent(c.RAND),
        new PanicSellerAgent(c.PANIC),
      ]
    }
    case AssetCluster.A_MID: {
      const c = counts.A_MID
      return [
        new MarketMakerAgent(c.MM),
        new ValueInvestorAgent(c.VAL),
        new MomentumAgent(c.MOM),
        new ContrarianAgent(c.CONT),
        new RandomTraderAgent(c.RAND),
      ]
    }
    case AssetCluster.A_SMALL: {
      const c = counts.A_SMALL
      return [
        new MarketMakerAgent(c.MM),
        new ValueInvestorAgent(c.VAL),
        new MomentumAgent(c.MOM),
        new RandomTraderAgent(c.RAND),
        new ContrarianAgent(c.CONT),
        new PanicSellerAgent(c.PANIC),
      ]
    }
    case AssetCluster.B_LIQUID: {
      const c = counts.B_LIQUID
      return [
        new MarketMakerAgent(c.MM),
        new RandomTraderAgent(c.RAND),
        new MomentumAgent(c.MOM),
        new PanicSellerAgent(c.PANIC),
      ]
    }
    case AssetCluster.B_ILLIQ: {
      const c = counts.B_ILLIQ
      return [
        new MarketMakerAgent(c.MM),
        new RandomTraderAgent(c.RAND),
      ]
    }
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
