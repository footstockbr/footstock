// ============================================================================
// FootStock Motor — PriceCalculator
// Orquestra as 10 camadas quantitativas (L1-L10) + CorrelationLayer.
//
// Pipeline canônico (T-009):
//   [guard isPaused] → L1→L2→L3→L4→L5→L6→L7→[L7.5 Nudge]→L8(cap)→L9(dailyvol)→[Corr]→L10(CB trigger)
//
// Mapeamento INTAKE → Camadas:
//   L1  OrnsteinUhlenbeck  — componente estocástica: σ×√dt×N(0,1)×P
//   L2  FundamentalAnchor  — âncora determinística: θ×(FV−P)×dt (cap 0.3%/tick)
//   L3  GARCHLite          — volatilidade condicional GARCH(1,1)
//   L4  OrderFlowImbalance — OFI com EWMA por cluster (alphaOfi configurável)
//   L5  KyleLambda         — impacto de mercado assimétrico (buys sobem mais)
//   L6  SupplyScaling      — amplificação por escassez de float
//   L7  PressureQueue      — absorção de notícias em 10+40 ticks
//   L8  VelocityCap        — cap 0.35%/tick absoluto
//   L9  DailyVolTarget     — meta diária 2.5% (reduz σ a 2.0%, freeze a 2.5%)
//   L10 CircuitBreaker     — halt 8% (trigger APÓS L1-L9, guard no início)
//   Corr CorrelationLayer  — correlação inter-cluster + regional
// ============================================================================

import type Redis from 'ioredis'
import type { AssetState, ClusterParams, LayerResult, PreviousTickDelta } from '../types/motor.types'
import { L1_OrnsteinUhlenbeck } from './layers/L1_OrnsteinUhlenbeck'
import { L2_FundamentalAnchor } from './layers/L2_FundamentalAnchor'
import { L3_GARCHLite } from './layers/L3_GARCHLite'
import { L4_OrderFlowImbalance } from './layers/L4_OrderFlowImbalance'
import { L5_KyleLambda } from './layers/L5_KyleLambda'
import { L6_SupplyScaling } from './layers/L6_SupplyScaling'
import { L7_PressureQueue } from './layers/L7_PressureQueue'
import { L8_VelocityCap } from './layers/L8_VelocityCap'
import { L9_DailyVolTarget } from './layers/L9_DailyVolTarget'
import { L10_CircuitBreaker } from './layers/L10_CircuitBreaker'
import { correlationLayer } from './CorrelationLayer'
import {
  NUDGE_TICKS,
  NUDGE_DELTA,
  PRICE_EPSILON,
  NUDGE_TOL_PCT,
  NUDGE_TOL_ABS,
  classifyNudgeMove,
} from './nudge-constants'

export interface PriceCalculationResult {
  /**
   * Preço publicado (canônico): dinâmica do motor (L1-L7) MAIS o delta do agente,
   * tudo passando por L8 (cap), correlação, freio e L10 (circuit breaker). É o preço
   * que evolui o estado do ativo e alimenta o candle/correlação. T1.4: antes o impacto
   * do agente era aplicado POR FORA (newPrice*(1+agentImpact)), escapando do cap e do CB.
   */
  newPrice: number
  /**
   * Preço PRÉ-agente (somente dinâmica do motor L1-L7 através de cap/correlação/freio,
   * SEM o delta do agente). Usado pelo matching default-safe de ordens reais (T1.4):
   * `MOTOR_REAL_ORDER_MATCH_PRICE=pre-agent` (default) casa ordens reais neste preço;
   * `post-agent` casa em `newPrice`. A escolha pre/pos é uma flag, não reimplementação.
   */
  enginePrice: number
  /** Impacto fracional do agente efetivamente injetado neste tick (0 quando não há agente). */
  agentImpact: number
  layerResults: LayerResult[]
  halted: boolean
}

export class PriceCalculator {
  private l1  = new L1_OrnsteinUhlenbeck()
  private l2  = new L2_FundamentalAnchor()
  private l3  = new L3_GARCHLite()
  private l4  = new L4_OrderFlowImbalance()
  private l5  = new L5_KyleLambda()
  private l6  = new L6_SupplyScaling()
  private l7  = new L7_PressureQueue()
  private l8  = new L8_VelocityCap()
  private l9  = new L9_DailyVolTarget()
  private l10 = new L10_CircuitBreaker()

  /** Redis opcional: usado para persistência async de variance, OFI state, daily vol. */
  private redis: Redis | null = null

  constructor(redis?: Redis) {
    this.redis = redis ?? null
  }

  /**
   * Calcula o novo preço aplicando as 10 camadas em sequência canônica:
   *   guard → L1→L2→L3→L4→L5→L6→L7→L8(cap)→L9(dailyvol)→Corr→L10(CB trigger)
   *
   * @param state          Estado atual do ativo (mutado por L3, L4, L7, L9)
   * @param params         Parâmetros do cluster
   * @param noise          Ruído gaussiano N(0,1) injetado externamente (testável)
   * @param previousDeltas Deltas do tick anterior para correlação inter-ativos
   * @param agentImpact    Impacto fracional dos agentes de mercado (T1.4). Entra como
   *                       delta ANTES de L8/correlação/freio/L10 — 100% do impacto passa
   *                       pela trava de velocidade e pelo circuit breaker, sem caminho
   *                       alternativo nem duplo desconto. Default 0 (sem agentes).
   */
  calculate(
    state: AssetState,
    params: ClusterParams,
    noise: number,
    previousDeltas?: Map<string, PreviousTickDelta>,
    agentImpact: number = 0
  ): PriceCalculationResult {
    // Guard: ativo pausado (circuit breaker ou admin) — short-circuit sem processar
    if (state.isPaused) {
      return { newPrice: state.currentPrice, enginePrice: state.currentPrice, agentImpact: 0, layerResults: [], halted: true }
    }

    // T3.2 — Propaga o retorno tick-a-tick do tick ANTERIOR (r_{t-1}) para L3_GARCH.
    // previousDeltas.deltaPercent é o MESMO retorno tick-a-tick de T3.1 (não o retorno
    // vs close diário). Ausente no primeiro tick pós-restart => 0.
    state.lastTickReturn = previousDeltas?.get(state.id)?.deltaPercent ?? 0

    const layerResults: LayerResult[] = []

    // L9 pré-check: atualiza dailySigmaMultiplier baseado no vol acumulado ANTERIOR
    // (L1 e L3 leem dailySigmaMultiplier no mesmo tick — lag de 1 tick é correto)
    const l9Result = this.l9.applyLayer(state, params, noise)
    layerResults.push(l9Result)

    // L1–L7: acumular delta de cada camada
    let totalDelta = 0
    const mainLayers = [
      this.l1,  // L1: OU estocástico (usa dailySigmaMultiplier de L9)
      this.l2,  // L2: âncora FV determinística (cap 0.3%)
      this.l3,  // L3: GARCH (usa dailySigmaMultiplier de L9)
      this.l4,  // L4: OFI com EWMA
      this.l5,  // L5: Kyle Lambda (assimétrico)
      this.l6,  // L6: Supply Scaling (float ratio)
      this.l7,  // L7: Pressure Queue (notícias)
    ]

    for (const layer of mainLayers) {
      const result = layer.applyLayer(state, params, noise)
      totalDelta += result.deltaPrice
      layerResults.push(result)
    }

    // L7.5: Minimum Activity Nudge — porta do legacy-new/FootStock-new2.jsx (decisao I7).
    // Posicionado entre L7 e L8: opera no totalDelta acumulado de L1-L7 antes do cap.
    // Quando o candidato (rounded) iguala o preco atual, incrementa contador de inatividade;
    // ao atingir NUDGE_TICKS, injeta ±NUDGE_DELTA na direcao de fairValue para destravar UX.
    const nudgeDelta = this._applyNudge(state, totalDelta)
    if (nudgeDelta !== 0) {
      totalDelta += nudgeDelta
      layerResults.push({
        layer: 'L7_5_Nudge',
        deltaPrice: nudgeDelta,
        metadata: { ticksSinceLastChange: 0, nudgeTicks: NUDGE_TICKS },
      })
    }

    // Delta acumulado da dinâmica do motor (L1-L7 + nudge), PRÉ-agente. Preservado
    // separadamente para derivar o preço pré-agente do matching default-safe (T1.4).
    const engineDelta = totalDelta

    // T1.4: impacto dos agentes entra como DELTA no pipeline, ANTES de L8/correlação/
    // freio/L10. Antes era aplicado por fora (finalPrice = newPrice*(1+agentImpact)),
    // escapando da trava de velocidade e do circuit breaker (D2: "nenhuma fonte de preço
    // escapa"). agentImpact é fracional (cap ±2% no orquestrador); convertido para delta
    // absoluto sobre o preço do tick e somado ANTES do cap para que L8 e L10 vejam o
    // movimento combinado motor+agente — 100% do impacto passa pelo cap e pelo CB, sem
    // caminho alternativo nem duplo desconto (o impacto entra UMA vez, aqui).
    const agentDelta = state.currentPrice * agentImpact
    const combinedRawDelta = engineDelta + agentDelta
    if (agentDelta !== 0) {
      // Registro pré-cap do impacto bruto do agente, para rastreabilidade na atribuição
      // e no debug. O efeito pós-cap está embutido no L8 abaixo (cap sobre o COMBINADO).
      layerResults.push({
        layer: 'L7_9_AgentImpact',
        deltaPrice: agentDelta,
        metadata: { agentImpact, engineDelta, combinedRawDelta },
      })
    }

    // L8: velocity cap no delta acumulado COMBINADO (0.35% absoluto por tick)
    const cappedDelta = this.l8.applyCap(combinedRawDelta, state.currentPrice, params.maxTickChange)
    layerResults.push({
      layer: 'L8_VelocityCap',
      deltaPrice: cappedDelta - combinedRawDelta,
      metadata: { originalDelta: combinedRawDelta, cappedDelta, engineDelta, agentDelta },
    })

    // Correlação inter-ativos (cluster + regional). Independe do agente; o mesmo delta
    // de correlação entra nos dois caminhos (publicado e pré-agente).
    let correlationDelta = 0
    if (previousDeltas && previousDeltas.size > 1) {
      const corrResult = correlationLayer.compute(state, previousDeltas)
      correlationDelta = corrResult.delta
      if (correlationDelta !== 0) {
        layerResults.push({
          layer: 'L10_Correlation',  // mantido como L10 para compatibilidade
          deltaPrice: correlationDelta,
          metadata: {
            clusterRho: corrResult.clusterRho,
            regionalRho: corrResult.regionalRho,
            clusterPeers: corrResult.clusterPeers,
            regionalPeers: corrResult.regionalPeers,
          },
        })
      }
    }

    // Freio de aproximação da banda do circuit breaker (mantém a meta diária sob
    // o threshold de 8% sem derrubar os ativos). O congelamento de L9_DailyVolTarget
    // só afeta o sigma de L1/L3; L2/L4/L5/L6 continuam empurrando o preço para fora
    // da âncora, atingindo os 8% e disparando o CB em loop. Este freio reduz
    // progressivamente apenas os deltas que AFASTAM o preço da âncora (closePrice)
    // conforme ele se aproxima da banda; movimentos de volta ao centro nunca são
    // freados. Notícias (CB a 20%) ficam isentas. Ver L10_CircuitBreaker.
    const combinedDelta = cappedDelta + correlationDelta
    const brakedDelta = this._applyApproachBrake(combinedDelta, state)
    if (brakedDelta !== combinedDelta) {
      layerResults.push({
        layer: 'L9_5_ApproachBrake',
        deltaPrice: brakedDelta - combinedDelta,
        metadata: { combinedDelta, brakedDelta },
      })
    }

    // Preço candidato PUBLICADO (com agente, antes do CB trigger). T4.5: o piso e a
    // protecao numerica PRICE_EPSILON (1 centavo), nao a ancora economica R$1 — ativos
    // sub-R$1 nao sao mais catapultados ao floor (sem retorno artificial pelo piso),
    // e o preco permanece estritamente positivo (sem divisao por zero a jusante).
    const candidatePrice = Math.max(PRICE_EPSILON, state.currentPrice + brakedDelta)

    // Preço PRÉ-agente: mesma sequência cap → correlação → freio aplicada APENAS à
    // dinâmica do motor (sem agentDelta). Alimenta o matching default-safe de ordens
    // reais (T1.4). Quando agentImpact == 0, enginePrice == candidatePrice (identidade).
    const cappedEngineDelta = agentDelta !== 0
      ? this.l8.applyCap(engineDelta, state.currentPrice, params.maxTickChange)
      : cappedDelta
    const brakedEngineDelta = agentDelta !== 0
      ? this._applyApproachBrake(cappedEngineDelta + correlationDelta, state)
      : brakedDelta
    const enginePrice = Math.max(PRICE_EPSILON, state.currentPrice + brakedEngineDelta)

    // L10: Circuit Breaker trigger — verifica o preço PUBLICADO (com agente) vs closePrice.
    // Assim o impacto do agente está sujeito ao CB (D2): se o agente empurrar o preço além
    // da banda de 8%, o halt dispara igual a qualquer outra fonte de movimento.
    const cbResult = this.l10.checkTrigger(candidatePrice, state, params)
    layerResults.push(cbResult)

    if (cbResult.triggered) {
      // Halt: MarketEngine gerencia timer de retomada
      return { newPrice: state.currentPrice, enginePrice: state.currentPrice, agentImpact, layerResults, halted: true }
    }

    // Acumular variação diária para L9 (próximo tick) — usa o delta PUBLICADO (com agente),
    // que é o movimento real do preço canônico.
    const deltaFrac = state.currentPrice > 0 ? Math.abs(brakedDelta) / state.currentPrice : 0
    this.l9.accumulate(state, deltaFrac)

    // Persistir estados críticos no Redis de forma assíncrona (sem bloquear o tick)
    this._persistToRedis(state)

    return { newPrice: candidatePrice, enginePrice, agentImpact, layerResults, halted: false }
  }

  /**
   * Freio de aproximação da banda do circuit breaker.
   *
   * Reduz progressivamente os deltas que AFASTAM o preço da âncora (closePrice)
   * conforme o deslocamento líquido se aproxima do threshold do CB (8%):
   *   - |net| < BRAKE_START (5%): sem freio.
   *   - BRAKE_START <= |net| < BRAKE_FULL (7%): fator linear de 1 -> 0.
   *   - |net| >= BRAKE_FULL (7%): deltas para fora são zerados.
   * Movimentos de VOLTA ao centro (reduzem |net|) nunca são freados, então o
   * preço sempre pode reverter. Notícias (newsImpactTicks > 0) ficam isentas
   * porque têm threshold próprio de 20% no L10. O CB de 8% permanece como
   * última linha de defesa para picos multi-camada/correlação.
   */
  private _applyApproachBrake(delta: number, state: AssetState): number {
    if (delta === 0 || state.closePrice <= 0) return delta

    // Notícia ativa: não freia (L10 tolera até 20% durante absorção).
    if (state.newsImpact !== 0 && state.newsImpactTicks > 0) return delta

    const net = (state.currentPrice - state.closePrice) / state.closePrice
    const candidateNet = (state.currentPrice + delta - state.closePrice) / state.closePrice

    // Só freia se o movimento aumenta o afastamento da âncora.
    const movingOut = Math.abs(candidateNet) > Math.abs(net)
    if (!movingOut) return delta

    const BRAKE_START = 0.05 // 5%: começa a frear
    const BRAKE_FULL = 0.07  // 7%: freio total (1% de folga até o CB de 8%)
    const absNet = Math.abs(net)

    let factor: number
    if (absNet >= BRAKE_FULL) factor = 0
    else if (absNet > BRAKE_START) factor = 1 - (absNet - BRAKE_START) / (BRAKE_FULL - BRAKE_START)
    else factor = 1

    return delta * factor
  }

  /**
   * Reset do DailyVolTarget — chamado na transição para PRE_OPENING.
   */
  resetDailyVolTarget(state?: AssetState): void {
    // Se state fornecido, reseta apenas aquele ativo
    if (state) {
      this.l9.resetForSession(state)
    }
  }

  /**
   * Compatibilidade retroativa: resetDailyVolCap → resetDailyVolTarget (global).
   * Usado por MarketEngine.resetDailyVolCap() para resetar todos os ativos.
   */
  resetDailyVolCap(): void {
    // Nota: o reset real ocorre por ativo via resetDailyVolTarget(state)
    // Este método existe por compatibilidade — MarketEngine itera os estados
  }

  /**
   * Minimum Activity Nudge — porta de FootStock-new2.jsx L1158-L1177.
   *
   * Mantem contador per-asset `ticksSinceLastChange` no proprio AssetState.
   * Quando o delta acumulado (P + totalDelta) fica DENTRO da tolerancia
   * (max(NUDGE_TOL_PCT*|P|, NUDGE_TOL_ABS); tolerancia zero = igualdade estrita
   * a 2 casas), o tick conta como inatividade e incrementa o contador. Ao atingir
   * NUDGE_TICKS, retorna delta ±NUDGE_DELTA na direcao do fairValue para destravar
   * UX em ativos de baixa liquidez. Movimento acima da tolerancia reseta o contador.
   * Entrada invalida (NaN/null/undefined) aborta defensivamente, sem nudge silencioso.
   *
   * Nao opera durante circuit breaker (state.isPaused) — preco intencionalmente
   * congelado. L8 (cap) e L10 (CB) recebem o nudge aplicado e continuam invioláveis.
   *
   * @returns delta adicional a somar em totalDelta (0 quando nao dispara).
   */
  private _applyNudge(state: AssetState, totalDelta: number): number {
    if (state.isPaused) return 0

    const P = state.currentPrice

    // Criterio de inatividade (T4.4): tolerancia percentual/absoluta no lugar da
    // antiga igualdade a 2 casas. limiar = max(pct*|P|, abs); dentro da tolerancia
    // conta como parado, acima conta como movimento real. tolerancia zero volta a
    // igualdade estrita anterior.
    const moveClass = classifyNudgeMove(totalDelta, P, NUDGE_TOL_PCT, NUDGE_TOL_ABS)

    // Defensivo: entrada invalida (NaN/null/undefined em delta/preco/tolerancia)
    // aborta o nudge sem disparo silencioso e sem excecao; contador intacto.
    if (moveClass === 'invalid') {
      console.error(
        `[nudge] entrada invalida em _applyNudge (ticker=${state.ticker}, ` +
        `delta=${totalDelta}, price=${P}, tolPct=${NUDGE_TOL_PCT}, tolAbs=${NUDGE_TOL_ABS}); ` +
        `nudge abortado.`
      )
      return 0
    }

    if (moveClass === 'moved') {
      state.ticksSinceLastChange = 0
      return 0
    }

    const ticks = (state.ticksSinceLastChange ?? 0) + 1
    state.ticksSinceLastChange = ticks

    if (ticks < NUDGE_TICKS) return 0

    const dir = state.fairValue >= P ? 1 : -1
    // T4.5: o nudge tambem respeita o piso NUMERICO (PRICE_EPSILON), nunca a ancora R$1
    // — caso contrario um ativo sub-R$1 inativo seria empurrado ao floor de R$1 pelo
    // proprio micro-choque, reintroduzindo o retorno artificial que esta task elimina.
    const target = Math.max(PRICE_EPSILON, +(P + dir * NUDGE_DELTA).toFixed(2))
    state.ticksSinceLastChange = 0
    return target - P
  }

  /**
   * Persiste estados críticos no Redis (fire-and-forget).
   * Erros são silenciados para não interromper o pipeline de ticks.
   */
  private _persistToRedis(state: AssetState): void {
    if (!this.redis) return

    const today = new Date().toISOString().slice(0, 10)
    const now   = Date.now()

    // GARCH variance: TTL 2h
    this.redis.setex(
      `garch:var:${state.ticker}`,
      7200,
      state.variance.toString()
    ).catch(() => null)

    // OFI state (decaimento exponencial): TTL 1h
    this.redis.setex(
      `ofi:state:${state.ticker}`,
      3600,
      (state.ofiState ?? 0).toString()
    ).catch(() => null)

    // OFI history (sub-chart): lista circular de 100 pontos, TTL 1h
    this.redis.lpush(
      `ofi:history:${state.ticker}`,
      JSON.stringify({ timestamp: now, ofi: state.ofiState ?? 0 })
    ).then(() =>
      this.redis!.ltrim(`ofi:history:${state.ticker}`, 0, 99)
    ).then(() =>
      this.redis!.expire(`ofi:history:${state.ticker}`, 3600)
    ).catch(() => null)

    // Daily vol accumulator: TTL 25h
    this.redis.setex(
      `daily_vol:${state.ticker}:${today}`,
      90000,
      (state.dailyVolAccum ?? 0).toString()
    ).catch(() => null)
  }

  /**
   * Hydrata estados do Redis para um ativo específico.
   * Deve ser chamado por MarketEngine no loadAssets() ao inicializar.
   */
  async hydrateFromRedis(state: AssetState): Promise<void> {
    if (!this.redis) return

    const today = new Date().toISOString().slice(0, 10)

    try {
      const [savedVariance, savedOfi, savedDailyVol] = await Promise.all([
        this.redis.get(`garch:var:${state.ticker}`),
        this.redis.get(`ofi:state:${state.ticker}`),
        this.redis.get(`daily_vol:${state.ticker}:${today}`),
      ])

      state.variance      = this._hydrateNum(savedVariance, state.variance, 'garch:var', state.ticker)
      state.ofiState      = this._hydrateNum(savedOfi, state.ofiState, 'ofi:state', state.ticker)
      state.dailyVolAccum = this._hydrateNum(savedDailyVol, state.dailyVolAccum, 'daily_vol', state.ticker)
    } catch {
      // Falha silenciosa — Redis indisponível não bloqueia o motor
    }
  }

  /**
   * Parse defensivo de um valor numérico hidratado do Redis.
   *
   * Aceita somente valores que passam `Number.isFinite`. Payload ausente
   * (null/string vazia) mantém o default atual silenciosamente; payload
   * presente porém inválido (NaN, Infinity, lixo) mantém o default e emite
   * warn — nunca propaga NaN/Infinity para o estado do motor. A semântica
   * dos defaults permanece inalterada: valores válidos persistidos continuam
   * sobrescrevendo o estado exatamente como antes.
   */
  private _hydrateNum(
    raw: string | null,
    current: number,
    key: string,
    ticker: string
  ): number {
    if (raw === null || raw === '') return current
    const parsed = parseFloat(raw)
    if (Number.isFinite(parsed)) return parsed
    console.warn(
      `[PriceCalculator] hidratacao Redis invalida para ${key} (${ticker}): "${raw}" -> mantendo default ${current}`
    )
    return current
  }
}
