// ============================================================================
// FootStock Motor — AgentOrchestrator
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
import { getClusterParams } from '../microstructure/clusters'
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

/**
 * Gating de agentes por volatilidade de sessao (loop 06-17, T1.2).
 *
 * O `ctx.volatilityMultiplier` (multiplicador da sessao corrente, ver
 * SessionConfig: 1.00 em TRADING, 0.30/0.20/0.10/0.00 nas sessoes de baixa
 * liquidez) passa a modular o impacto dos agentes de forma UNIFORME aos 6
 * tipos vivos, sem alterar os pesos relativos entre eles:
 *
 *   - `volatilityMultiplier < VOLATILITY_GATE_THRESHOLD` -> tick inteiro vira
 *     HOLD (impacto efetivo zero). Em sessoes de baixissima volatilidade os
 *     agentes nao devem empurrar preco.
 *   - caso contrario -> o `priceModifier` de cada decisao e escalado pelo
 *     mesmo multiplicador. Como o escalar e identico para todos os agentes, a
 *     proporcao relativa entre eles permanece intacta (apenas a amplitude
 *     agregada muda). Em TRADING (vm=1.0) a escala e identidade — sem regressao
 *     no harness (CA2) nem nos testes existentes.
 */
export const VOLATILITY_GATE_THRESHOLD = 0.5

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
 * Resultado detalhado de um tick de agentes: decisões válidas (não-HOLD,
 * usadas no cálculo de impacto/volume) + mapa por id de agente com a decisão
 * crua de cada um (inclui HOLD). O mapa é usado apenas por instrumentação de
 * leitura — nunca altera o impacto agregado nem volume sintético.
 */
export interface TickDetail {
  decisions: AgentDecision[]
  byAgentId: Record<string, AgentDecision>
}

/**
 * Executa decide() em todos os agentes com try/catch individual (uma única
 * chamada por agente — preserva estado interno como MarketMaker.lastSide).
 * Retorna decisões válidas (filtra HOLD) e o mapa cru por agente.
 */
export function runTickDetailed(agents: BaseAgent[], ctx: MarketContext): TickDetail {
  const decisions: AgentDecision[] = []
  const byAgentId: Record<string, AgentDecision> = {}

  // Gating por volatilidade de sessao (T1.2). `vm` ausente/NaN = sem gate
  // (scale=1, gated=false) — preserva o comportamento de callers que nao
  // populam o campo. Aplicado UNIFORMEMENTE a todos os agentes.
  const vm = ctx.volatilityMultiplier
  const gated = Number.isFinite(vm) && vm < VOLATILITY_GATE_THRESHOLD
  const scale = Number.isFinite(vm) ? Math.max(0, vm) : 1

  for (const agent of agents) {
    let decision: AgentDecision
    try {
      // Sempre 1 chamada por agente, mesmo quando gated: preserva o estado
      // interno (ex.: MarketMaker.lastSide) entre ticks de forma consistente.
      decision = agent.decide(ctx)
    } catch (err) {
      logger.error(JSON.stringify({
        level: 'error',
        code: 'SYS_001',
        agent: agent.id,
        error: String(err),
      }))
      // HOLD implícito — outros agentes continuam (sem entrada em byAgentId)
      continue
    }

    if (gated) {
      // Sessao de baixa volatilidade: forca HOLD uniforme. A decisao crua e
      // descartada do impacto agregado; byAgentId reflete o gate para leitura.
      byAgentId[agent.id] = {
        side: 'HOLD',
        quantity: 0,
        priceModifier: 0,
        reason: `volatility-gate: vm=${vm} < ${VOLATILITY_GATE_THRESHOLD}`,
      }
      continue
    }

    if (decision.side === 'HOLD') {
      byAgentId[agent.id] = decision
      continue
    }

    // Escala uniforme do priceModifier (mesmo escalar p/ todos os agentes):
    // modula a amplitude agregada sem mudar pesos relativos. quantity intacta
    // (volume sintetico nao depende do gate de impacto). vm=1.0 = identidade.
    const scaled: AgentDecision = scale === 1
      ? decision
      : { ...decision, priceModifier: decision.priceModifier * scale }
    byAgentId[agent.id] = scaled
    decisions.push(scaled)
  }

  return { decisions, byAgentId }
}

/**
 * Executa decide() em todos os agentes com try/catch individual.
 * Filtra HOLDs e retorna decisões válidas.
 */
export function runTick(agents: BaseAgent[], ctx: MarketContext): AgentDecision[] {
  return runTickDetailed(agents, ctx).decisions
}

/**
 * Representação canônica do fluxo de ordens de uma decisão de agente (T1.3).
 *
 * Substitui o retorno fracional `priceModifier * quantity` (que misturava uma
 * fração de preço com uma contagem de unidades — dimensionalmente incoerente e
 * a causa-raiz da saturação no cap). O agente passa a contribuir com:
 *   - `signedVolume`: volume assinado pela intenção (BUY = +qty, SELL = -qty,
 *     HOLD = 0). Preserva a intenção de compra/venda.
 *   - `deltaNotional`: o mesmo fluxo em moeda (signedVolume * preço de
 *     referência). Campo de instrumentação/atribuição — não entra no impacto,
 *     que é função do volume relativo à profundidade (baseVolume), não da moeda.
 */
export interface AgentFlow {
  signedVolume: number
  deltaNotional: number
}

/** Deriva o fluxo assinado (volume + notional) de uma decisão. Puro. */
export function decisionFlow(d: AgentDecision, refPrice: number): AgentFlow {
  const sign = d.side === 'BUY' ? 1 : d.side === 'SELL' ? -1 : 0
  const signedVolume = sign * d.quantity
  return { signedVolume, deltaNotional: signedVolume * refPrice }
}

/**
 * Lei de impacto sublinear de Kyle por cluster (T1.3).
 *
 * Reusa a MESMA calibração da camada `L5_KyleLambda` do motor — `lambdaKyle`
 * (sensibilidade) e `baseVolume` (profundidade do book) de `CLUSTER_PARAMS`:
 *
 *   impacto = sign(V) * lambdaKyle * sqrt(|V| / baseVolume)
 *
 * onde `V` é o fluxo líquido assinado (compras − vendas) em unidades. A raiz
 * quadrada torna o impacto SUBLINEAR no volume (dobrar o fluxo multiplica o
 * impacto por ~1,41, não por 2), respondendo a volume E profundidade sem cravar
 * o teto. O cap ±MAX_AGGREGATE_IMPACT permanece como salvaguarda final contra
 * movimentos impossíveis, mas em regime normal não é mais atingido.
 */
export function kyleImpactFromFlow(netSignedVolume: number, cluster: AssetCluster): number {
  if (!Number.isFinite(netSignedVolume) || netSignedVolume === 0) return 0

  const params = getClusterParams(cluster)
  const baseVolume = params.baseVolume > 0 ? params.baseVolume : 1
  const sign = netSignedVolume > 0 ? 1 : -1
  const ratio = Math.abs(netSignedVolume) / baseVolume
  const raw = sign * params.lambdaKyle * Math.sqrt(ratio)

  const capped = Math.max(-MAX_AGGREGATE_IMPACT, Math.min(MAX_AGGREGATE_IMPACT, raw))

  if (Math.abs(raw) > MAX_AGGREGATE_IMPACT) {
    logger.warn(JSON.stringify({
      level: 'warn',
      message: 'kyleImpactFromFlow capped',
      cluster,
      cappedFrom: raw,
      cappedTo: capped,
    }))
  }

  return capped
}

/**
 * Converte as decisões dos agentes em impacto fracional de preço via lei
 * sublinear de Kyle por cluster (T1.3). O impacto é função do FLUXO LÍQUIDO
 * assinado (compras − vendas) relativo à profundidade do cluster — não mais do
 * produto linear `priceModifier * quantity`. Fluxo equilibrado (buys ≈ sells)
 * produz impacto ~0; fluxo desbalanceado move o preço de forma sublinear.
 */
export function aggregateImpact(
  decisions: AgentDecision[],
  cluster: AssetCluster = AssetCluster.A_SMALL,
): number {
  let netSignedVolume = 0
  for (const d of decisions) {
    netSignedVolume += decisionFlow(d, 1).signedVolume
  }
  return kyleImpactFromFlow(netSignedVolume, cluster)
}

/**
 * Fórmula LEGACY pré-T1.3: soma `sign * |priceModifier| * quantity` com cap
 * ±MAX_AGGREGATE_IMPACT. Preservada byte-a-byte APENAS para reproduzir o sintoma
 * (saturação no teto) no harness/golden de medição. NÃO usar em produção.
 */
export function aggregateImpactLegacy(decisions: AgentDecision[]): number {
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
  /**
   * Decisão do MarketMaker neste tick (inclui HOLD), null quando o ativo não
   * tem agentes. Campo de leitura para instrumentação/debug — não participa do
   * cálculo de preço.
   */
  marketMakerDecision: AgentDecision | null
}

/** Opções de tick. `legacyImpact` reativa a fórmula linear pré-T1.3 (harness). */
export interface TickOptions {
  legacyImpact?: boolean
}

export class AgentOrchestrator {
  private agents: Map<string, BaseAgent[]> = new Map()
  // Cluster por ativo: necessário para a lei de impacto sublinear de Kyle (T1.3),
  // que escala o impacto por lambdaKyle/baseVolume do cluster.
  private clusters: Map<string, AssetCluster> = new Map()

  /**
   * Inicializa agentes para um ativo específico.
   */
  initAsset(assetId: string, cluster: AssetCluster): void {
    this.agents.set(assetId, createAgents(cluster))
    this.clusters.set(assetId, cluster)
  }

  /**
   * Executa tick para um ativo e retorna impacto agregado + volume sintético.
   * O impacto usa a lei sublinear de Kyle por cluster (T1.3); `opts.legacyImpact`
   * reativa a fórmula linear pré-fix apenas para medição comparativa no harness.
   */
  tickAsset(assetId: string, ctx: MarketContext, opts?: TickOptions): TickResult {
    const agents = this.agents.get(assetId)
    if (!agents) return { impact: 0, syntheticVolume: 0, marketMakerDecision: null }

    const cluster = this.clusters.get(assetId) ?? AssetCluster.A_SMALL
    const { decisions, byAgentId } = runTickDetailed(agents, ctx)
    const impact = opts?.legacyImpact === true
      ? aggregateImpactLegacy(decisions)
      : aggregateImpact(decisions, cluster)
    const syntheticVolume = decisions.reduce((sum, d) => sum + d.quantity, 0)
    const marketMakerDecision = byAgentId['MarketMaker'] ?? null
    return { impact, syntheticVolume, marketMakerDecision }
  }

  /**
   * Limpa recursos de todos os agentes — chamar no SIGTERM/SIGINT.
   */
  dispose(): void {
    this.agents.clear()
    this.clusters.clear()
    logger.info('[AgentOrchestrator] dispose() — recursos liberados')
  }
}

/** Singleton compartilhado pelo motor */
export const agentOrchestrator = new AgentOrchestrator()
