// ============================================================================
// FootStock Motor — Harness de medicao (Item 003 / loop 06-17)
//
// Loop de replay DETERMINISTICO do nucleo do tick de producao.
//
// Fidelidade: usa o PriceCalculator REAL (10 camadas L1-L10 + Corr) e o
// AgentOrchestrator REAL (mesma matriz de agentes de producao). Reproduz, passo
// a passo, o miolo de MarketEngine.runTick() (linhas 392-587):
//   pendingBuy/Sell -> noise (Box-Muller) -> calculate() -> agentCtx ->
//   tickAsset() -> finalPrice = max(1, newPrice*(1+impact)) -> update state.
// Sem DB/Redis/order-flow: PriceCalculator e instanciado sem Redis (no-op de
// persistencia) e o book fica equilibrado (pendingBuy=pendingSell=0).
//
// Aleatoriedade: o caller injeta o RNG semeado (installSeededRandom) ANTES de
// chamar runHarness; aqui apenas consumimos Math.random como o motor faz.
// ============================================================================

import { PriceCalculator } from '../engine/PriceCalculator'
import { AgentOrchestrator, AssetCluster } from '../agents/AgentOrchestrator'
import { getClusterParams } from '../microstructure/clusters'
import { PRICE_EPSILON } from '../engine/nudge-constants'
import { deriveAgentQuotes } from '../engine/agent-quotes'
import type { MarketContext } from '../agents/BaseAgent'
import type { AssetState, PreviousTickDelta } from '../types/motor.types'
import {
  ASSET_FIXTURES,
  DEFAULT_TICKS_PER_ASSET,
  SESSION_TYPE,
  SESSION_VOLATILITY_MULTIPLIER,
  buildInitialState,
  type HarnessAssetFixture,
} from './fixtures'
import { computeAssetPredicates, type AssetPredicates, type TickRecord } from './predicates'

const MAX_DAILY_VOLUME = 1_000_000_000_000_000 // espelha MarketEngine.ts:45
/** 5 min / 10s por tick = 30 ticks de halt (PAUSE_RESUME_MS em producao). */
const HALT_RESUME_TICKS = 30

/** Box-Muller N(0,1) — copia byte-a-byte de MarketEngine.gaussianNoise(). */
function gaussianNoise(): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
}

function findLayerDelta(layerResults: { layer: string; deltaPrice: number }[], name: string): number {
  for (const r of layerResults) {
    if (r.layer === name && Number.isFinite(r.deltaPrice)) return r.deltaPrice
  }
  return 0
}

export interface HarnessOptions {
  ticksPerAsset?: number
  assets?: HarnessAssetFixture[]
  /**
   * Reproduz o bug de unidade pre-fix (Item T1.1): ctx.spread ABSOLUTO
   * (newPrice*0.002) comparado contra TARGET_SPREAD fracional -> o MarketMaker
   * dispara em TODO tick, inclusive em book estreito. Default false (comportamento
   * corrigido: spread fracional = params.spread no book equilibrado do harness).
   */
  legacySpreadUnit?: boolean
  /**
   * Reproduz a fórmula de impacto LEGACY pré-fix (Item T1.3): impacto agregado =
   * `sign * |priceModifier| * quantity` com cap ±2%, que satura no teto em quase
   * todo tick (CA3 ~1). Default false (comportamento corrigido: lei sublinear de
   * Kyle por cluster, impacto função do fluxo líquido vs profundidade do book).
   */
  legacyImpactFormula?: boolean
  /**
   * Reproduz a aplicação LEGACY do impacto do agente pré-fix (Item T1.4): o impacto
   * era aplicado POR FORA do PriceCalculator (`finalPrice = newPrice*(1+agentImpact)`),
   * escapando da trava de velocidade (L8) e do circuit breaker (L10). Default false
   * (comportamento corrigido: impacto injetado como delta DENTRO do calculate, antes de
   * L8/correlação/freio/L10 — 100% do impacto passa pelo cap e pelo CB). Usado para
   * gerar/comparar o BASELINE GOLDEN pré-T1.4 (CA6: halts indevidos não sobem).
   */
  legacyAgentApplication?: boolean
  /**
   * Reproduz o dimensionamento LEGACY de quantity dos agentes pré-fix (Item T2.2):
   * MarketMaker/PanicSeller escalavam quantity por `state.volume` (volume executado,
   * realimentado por syntheticVolume a cada tick) em vez da profundidade fixa do book.
   * Isso criava o feedback loop linear (vol cresce ~0.1%/tick enquanto o spread excede
   * o alvo). Default false (comportamento corrigido: quantity função de params.baseVolume,
   * fixo por cluster). Quando true, `ctx.baseVolume` recebe `state.volume`, reproduzindo
   * o acoplamento pré-fix byte-a-byte para o BASELINE GOLDEN.
   */
  legacyAgentQuantity?: boolean
}

export interface HarnessResult {
  ticksPerAsset: number
  perAsset: Record<string, AssetPredicates>
  /**
   * T1.4: contagem de EVENTOS de halt (disparos do circuit breaker) por ticker neste
   * run. NÃO entra no golden (predicates) — é métrica auxiliar para a comparação CA6
   * "halts indevidos não sobem acima do baseline" entre o caminho legacy (aplicação
   * externa do impacto, que escapava do CB) e o caminho corrigido (impacto no cap+CB).
   */
  haltsByAsset: Record<string, number>
}

const CLUSTER_ENUM: Record<string, AssetCluster> = {
  A_TOP: AssetCluster.A_TOP,
  A_MID: AssetCluster.A_MID,
  A_SMALL: AssetCluster.A_SMALL,
  B_LIQUID: AssetCluster.B_LIQUID,
  B_ILLIQ: AssetCluster.B_ILLIQ,
}

/**
 * Executa a simulacao deterministica. O RNG ja deve estar semeado pelo caller.
 * Multi-ativo num unico loop temporal (ticks sincronizados) para alimentar a
 * CorrelationLayer com `previousDeltas` reais — fiel ao motor.
 */
export function runHarness(opts: HarnessOptions = {}): HarnessResult {
  const ticksPerAsset = opts.ticksPerAsset ?? DEFAULT_TICKS_PER_ASSET
  const fixtures = opts.assets ?? ASSET_FIXTURES
  const legacySpread = opts.legacySpreadUnit === true
  const legacyImpact = opts.legacyImpactFormula === true
  const legacyApply = opts.legacyAgentApplication === true
  const legacyQuantity = opts.legacyAgentQuantity === true

  const calculator = new PriceCalculator() // sem Redis -> persistencia no-op
  const orchestrator = new AgentOrchestrator()

  const states = new Map<string, AssetState>()
  const records = new Map<string, TickRecord[]>()
  const haltResumeIn = new Map<string, number>()
  // T1.4: eventos de halt (disparos do CB) por ticker — alimenta a comparação CA6.
  const haltCounts = new Map<string, number>()

  for (const fx of fixtures) {
    const state = buildInitialState(fx)
    states.set(state.id, state)
    records.set(fx.ticker, [])
    haltResumeIn.set(state.id, 0)
    orchestrator.initAsset(state.id, CLUSTER_ENUM[fx.cluster] ?? AssetCluster.B_ILLIQ)
  }

  let previousDeltas = new Map<string, PreviousTickDelta>()

  for (let tick = 0; tick < ticksPerAsset; tick++) {
    const nextDeltas = new Map<string, PreviousTickDelta>()

    for (const [assetId, state] of states) {
      // Retomada de circuit breaker (espelha scheduleCircuitBreakerResume + warm
      // re-anchor): apos HALT_RESUME_TICKS, despausa e re-ancora closePrice no
      // preco atual para nao reentrar em loop de CB (decisao de modelagem local).
      if (state.isPaused) {
        const left = (haltResumeIn.get(assetId) ?? 0) - 1
        if (left <= 0) {
          state.isPaused = false
          state.haltReason = null
          state.closePrice = state.currentPrice
          haltResumeIn.set(assetId, 0)
        } else {
          haltResumeIn.set(assetId, left)
        }
        records.get(state.ticker)!.push({
          ret: 0, agentImpact: 0, ofiState: state.ofiState ?? 0, l5Delta: 0,
          priceChanged: false, nonFinite: false, marketMakerActive: false,
        })
        continue
      }

      const params = getClusterParams(state.cluster)
      const prevPrice = state.currentPrice

      // Book equilibrado (fixture): sem order-flow real.
      state.pendingBuyVolume = 0
      state.pendingSellVolume = 0

      const noise = gaussianNoise()
      state.volatilityMultiplier = SESSION_VOLATILITY_MULTIPLIER

      // Resultado dos agentes dado um preço de referência (mid + ctx). Book equilibrado
      // no harness -> usa o MESMO helper puro do MarketEngine (deriveAgentQuotes com book
      // ausente = fallback do cluster, params.spread fracional). legacySpreadUnit reproduz
      // o valor ABSOLUTO pré-fix (refPrice*0.002) para a comparação vermelho/verde (T1.1).
      const computeAgentResult = (refPrice: number) => {
        const { bid: agentBid, ask: agentAsk, spread: fractionalSpread } = legacySpread
          ? { bid: refPrice * 0.999, ask: refPrice * 1.001, spread: refPrice * 0.002 }
          : deriveAgentQuotes(null, null, refPrice, params.spread)
        const agentCtx: MarketContext = {
          ticker: state.ticker,
          currentPrice: refPrice,
          fairValue: state.fairValue,
          priceChange24h: state.openPrice > 0 ? (refPrice - state.openPrice) / state.openPrice : 0,
          volume24h: state.volume,
          // T2.2: profundidade fixa do cluster desacopla quantity de state.volume.
          // legacyAgentQuantity realimenta state.volume como baseVolume para o golden
          // reproduzir o acoplamento (feedback loop) pré-fix byte-a-byte.
          baseVolume: legacyQuantity ? state.volume : params.baseVolume,
          bid: agentBid,
          ask: agentAsk,
          spread: fractionalSpread,
          session: SESSION_TYPE,
          volatilityMultiplier: SESSION_VOLATILITY_MULTIPLIER,
        }
        return orchestrator.tickAsset(assetId, agentCtx, { legacyImpact })
      }

      const recordHalt = () => {
        state.isPaused = true
        state.haltReason = 'CIRCUIT_BREAKER'
        haltResumeIn.set(assetId, HALT_RESUME_TICKS)
        haltCounts.set(state.ticker, (haltCounts.get(state.ticker) ?? 0) + 1)
        records.get(state.ticker)!.push({
          ret: 0, agentImpact: 0, ofiState: state.ofiState ?? 0, l5Delta: 0,
          priceChanged: false, nonFinite: false, marketMakerActive: false,
        })
      }

      let newPrice: number
      let finalPrice: number
      let layerResults: { layer: string; deltaPrice: number }[]
      let agentImpact: number
      let syntheticVolume: number
      let marketMakerActive: boolean

      if (legacyApply) {
        // Caminho LEGACY pré-T1.4: calcula o preço SEM o agente, depois aplica o impacto
        // POR FORA (escapa de L8/L10). O agente reage ao preço pós-camadas (newPrice).
        const calcResult = calculator.calculate(state, params, noise, previousDeltas)
        if (calcResult.halted) { recordHalt(); continue }
        newPrice = calcResult.newPrice
        layerResults = calcResult.layerResults
        const ar = computeAgentResult(newPrice)
        agentImpact = ar.impact
        syntheticVolume = ar.syntheticVolume
        marketMakerActive = ar.marketMakerDecision !== null && ar.marketMakerDecision.side !== 'HOLD'
        // T4.5: piso numerico (PRICE_EPSILON), nao a ancora economica R$1.
        finalPrice = Math.max(PRICE_EPSILON, newPrice * (1 + agentImpact))
      } else {
        // Caminho T1.4: o agente reage ao preço de início do tick (prevPrice) e o impacto
        // é INJETADO no calculate (antes de L8/correlação/freio/L10). O preço publicado já
        // inclui o agente capado/freado; o circuit breaker vê o movimento combinado.
        const ar = computeAgentResult(prevPrice)
        agentImpact = ar.impact
        syntheticVolume = ar.syntheticVolume
        marketMakerActive = ar.marketMakerDecision !== null && ar.marketMakerDecision.side !== 'HOLD'
        const calcResult = calculator.calculate(state, params, noise, previousDeltas, agentImpact)
        if (calcResult.halted) { recordHalt(); continue }
        newPrice = calcResult.newPrice
        layerResults = calcResult.layerResults
        finalPrice = newPrice
      }

      state.volume = Math.min(state.volume + syntheticVolume, MAX_DAILY_VOLUME)
      state.currentPrice = finalPrice
      state.highPrice = Math.max(state.highPrice, finalPrice)
      state.lowPrice = Math.min(state.lowPrice, finalPrice)

      const ret = prevPrice > 0 ? finalPrice / prevPrice - 1 : 0
      const l5Delta = findLayerDelta(layerResults, 'L5_KyleLambda')
      const nonFinite = !Number.isFinite(finalPrice) || !Number.isFinite(ret) || !Number.isFinite(agentImpact)

      records.get(state.ticker)!.push({
        ret,
        agentImpact,
        ofiState: state.ofiState ?? 0,
        l5Delta,
        priceChanged: Math.round(finalPrice * 100) !== Math.round(prevPrice * 100),
        nonFinite,
        marketMakerActive,
      })

      if (state.currentPrice > 0) {
        nextDeltas.set(assetId, {
          deltaPercent: ret,
          cluster: state.cluster,
          state: state.state,
        })
      }
    }

    previousDeltas = nextDeltas
  }

  const perAsset: Record<string, AssetPredicates> = {}
  const haltsByAsset: Record<string, number> = {}
  for (const fx of fixtures) {
    perAsset[fx.ticker] = computeAssetPredicates(fx.ticker, records.get(fx.ticker)!)
    haltsByAsset[fx.ticker] = haltCounts.get(fx.ticker) ?? 0
  }

  orchestrator.dispose()
  return { ticksPerAsset, perAsset, haltsByAsset }
}
