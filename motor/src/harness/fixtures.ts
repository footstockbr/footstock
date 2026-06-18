// ============================================================================
// FootStock Motor — Harness de medicao (Item 003 / loop 06-17)
//
// Fixtures: os FATOS de configuracao de PRODUCAO encodados de forma explicita,
// para que o baseline golden seja reproduzivel sem DB/Redis/order-flow real.
//
// Fontes (lidas do codigo real, nao inventadas):
//   - Tick de 10s em producao .......... docs/DIAGNOSTICO-VARIACOES-vs-LEGACY.md
//   - DT default 1.0 (env vazia) ....... src/engine/layers/L1_OrnsteinUhlenbeck.ts:20
//   - Contagens de agente V1 (prod OFF). src/agents/AgentOrchestrator.ts:56-62
//   - Cluster params canonicos ......... src/microstructure/clusters.ts
//   - Construcao de AssetState ......... src/engine/MarketEngine.ts:255 (loadAssets)
//   - Multiplicador de sessao TRADING=1. src/engine/SessionManager (sessao plena)
//
// Book equilibrado (pendingBuy = pendingSell = 0): reproduz a simulacao do
// diagnostico (§ Sumario executivo), que isola ruido + L9 + trava + agentes
// SEM order-flow real. E o cenario canonico para medir o serrilhado dos agentes.
// ============================================================================

import type { AssetCluster, AssetState, SessionType } from '../types/motor.types'
import { CLUSTER_PARAMS } from '../microstructure/clusters'

/** Fato: producao roda 1 tick a cada 10 segundos. */
export const PRODUCTION_TICK_INTERVAL_SECONDS = 10

/**
 * Fato: `MOTOR_TICK_DT_SECONDS` esta VAZIA em producao, entao L1/L2/L3 usam o
 * default 1.0 (este e o Bug 1 do diagnostico — dt deveria ser ~1/390). O baseline
 * pre-fix DEVE rodar com dt=1.0 para reproduzir o ruido inflado da abertura.
 */
export const PRODUCTION_DT_SECONDS_DEFAULT = 1.0

/**
 * Fato: `MOTOR_AGENT_COUNTS_V2` esta OFF em producao -> matriz V1 (54 agentes).
 * Irrelevante para o impacto (o `weight` e no-op), mas encodado por fidelidade.
 */
export const PRODUCTION_AGENT_COUNTS = 'V1_LEGACY' as const

/** Fato: durante o pregao pleno o multiplicador de sessao e 1.0 (TRADING). */
export const SESSION_TYPE: SessionType = 'TRADING'
export const SESSION_VOLATILITY_MULTIPLIER = 1.0

/** Numero canonico de ticks por ativo: 8640 ticks x 10s = 24h de pregao. */
export const DEFAULT_TICKS_PER_ASSET = 8_640

/** Seed canonica do baseline golden (qualquer inteiro fixo serve; documentado). */
export const DEFAULT_SEED = 1_337

/**
 * Definicao de um ativo simulado. Precos/fairValues representativos de cada tier
 * (A_TOP liquido ~R$100; B_ILLIQ iliquido ~R$2,65 como o ABT3 citado em nudge-constants).
 */
export interface HarnessAssetFixture {
  ticker: string
  cluster: AssetCluster
  uf: string
  initialPrice: number
  fairValue: number
}

/**
 * >= 2 ativos de tiers distintos: cobre o A_TOP (causa dominante mais visivel,
 * volume alto -> MM satura facil) e o B_ILLIQ (iliquido, lambdaKyle alto).
 */
export const ASSET_FIXTURES: HarnessAssetFixture[] = [
  { ticker: 'URU3', cluster: 'A_TOP', uf: 'SP', initialPrice: 100.0, fairValue: 100.0 },
  { ticker: 'ABT3', cluster: 'B_ILLIQ', uf: 'RS', initialPrice: 2.65, fairValue: 2.65 },
]

/**
 * Constroi um AssetState inicial espelhando MarketEngine.loadAssets() (warm start:
 * close/open/high/low = currentPrice; variance GARCH inicial 0.00001; ofiState 0).
 *
 * `volume` inicial = baseVolume do cluster: posiciona o ativo na liquidez de
 * meia-sessao para que o MarketMaker atinja o regime de saturacao desde o tick 1
 * (em producao a mesma saturacao e alcancada minutos apos a abertura). Sem isso,
 * `quantity = max(1, floor(volume*0.001))` comeca em 1 e o serrilhado so emergiria
 * gradualmente — distorcendo a estatistica do baseline.
 */
export function buildInitialState(fixture: HarnessAssetFixture): AssetState {
  const params = CLUSTER_PARAMS[fixture.cluster]
  const price = fixture.initialPrice
  return {
    id: `harness-${fixture.ticker}`,
    ticker: fixture.ticker,
    cluster: fixture.cluster,
    state: fixture.uf,
    currentPrice: price,
    openPrice: price,
    highPrice: price,
    lowPrice: price,
    closePrice: price,
    fairValue: fixture.fairValue,
    volume: params.baseVolume,
    variance: 0.00001,
    pendingBuyVolume: 0,
    pendingSellVolume: 0,
    isPaused: false,
    haltReason: null,
    haltResumeAt: null,
    newsImpact: 0,
    newsImpactTicks: 0,
    activeNewsImpacts: [],
    ofiState: 0,
    dailyVolAccum: 0,
    dailySigmaMultiplier: 1.0,
    volatilityMultiplier: SESSION_VOLATILITY_MULTIPLIER,
  }
}
