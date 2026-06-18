// ============================================================================
// FootStock Motor — T1.4 (loop 06-17-motor-footstock-correcoes-variacoes)
//
// Impacto dos agentes DENTRO do PriceCalculator: o impacto entra como delta
// ANTES de L8 (cap de velocidade) / correlacao / freio / L10 (circuit breaker).
// Antes do fix o impacto era aplicado POR FORA (finalPrice = newPrice*(1+impact)),
// escapando do cap e do CB. Estes testes garantem:
//   - 100% do impacto passa por L8 (um nominal de 2% vira <= 0.35%/tick);
//   - caminho unico, sem duplo desconto (agentImpact=0 -> newPrice === enginePrice);
//   - o agente entra UMA vez (newPrice = pre-agente + contribuicao CAPADA do agente);
//   - L10 (CB) roda no caminho com agente e o cap impede halt espurio do agente.
// (A subordinacao do agente ao CB em regime acumulado e medida no harness — CA6.)
// ============================================================================

import { PriceCalculator } from '../PriceCalculator'
import type { AssetState, ClusterParams } from '../../types/motor.types'

const baseState = (): AssetState => ({
  id: 'asset_001',
  ticker: 'FLM3',
  cluster: 'A_TOP',
  state: 'SP',
  currentPrice: 28.0,
  openPrice: 28.0,
  highPrice: 28.0,
  lowPrice: 28.0,
  closePrice: 28.0,
  fairValue: 28.0, // L2 neutro (sem pull de ancora): isola o delta do agente
  volume: 50000,
  variance: 0.0001,
  pendingBuyVolume: 0,
  pendingSellVolume: 0,
  isPaused: false,
  haltReason: null,
  haltResumeAt: null,
  newsImpact: 0,
  newsImpactTicks: 0,
  ofiState: 0,
  dailyVolAccum: 0,
  dailySigmaMultiplier: 1.0,
  volatilityMultiplier: 1.0,
})

const baseParams = (): ClusterParams => ({
  cluster: 'A_TOP',
  baseVolume: 50000,
  drift: 0.0,
  theta: 0.12,
  sigma: 0.0018,
  garchAlpha: 0.12,
  garchBeta: 0.85,
  lambdaKyle: 0.0001,
  spread: 0.0005,
  maxTickChange: 0.0035, // L8: cap 0.35%/tick
  ofiDecay: 0.91,
  alphaOfi: 0.0005,
})

const EPS = 1e-9

describe('T1.4 — impacto do agente dentro do PriceCalculator', () => {
  let calculator: PriceCalculator

  beforeEach(() => {
    calculator = new PriceCalculator()
  })

  test('agentImpact=0 -> newPrice === enginePrice (caminho unico, sem agente, sem layer extra)', () => {
    const r = calculator.calculate(baseState(), baseParams(), 0, undefined, 0)
    expect(r.halted).toBe(false)
    expect(r.newPrice).toBe(r.enginePrice)
    expect(r.agentImpact).toBe(0)
    expect(r.layerResults.find((l) => l.layer === 'L7_9_AgentImpact')).toBeUndefined()
  })

  test('100% do impacto passa por L8: nominal de 2% vira movimento <= 0.35%/tick', () => {
    const state = baseState()
    const params = baseParams()
    const r = calculator.calculate(state, params, 0, undefined, 0.02) // 2% nominal

    expect(r.halted).toBe(false)
    const move = Math.abs(r.newPrice - state.currentPrice) / state.currentPrice
    // O caminho ANTIGO (por fora) daria ~2%. Agora o cap de L8 limita a 0.35%.
    expect(move).toBeLessThanOrEqual(params.maxTickChange + EPS)
    // E NAO e o ~2% do caminho alternativo removido (sem duplo desconto):
    expect(move).toBeLessThan(0.02)

    // O cap engatou: L8 corta parte do delta COMBINADO (engine + agente).
    const l8 = r.layerResults.find((l) => l.layer === 'L8_VelocityCap')!
    expect(l8).toBeDefined()
    expect(l8.deltaPrice).toBeLessThan(0)
    // metadata expoe a separacao engine/agente (rastreabilidade, sem duplo desconto):
    const meta = l8.metadata as { engineDelta: number; agentDelta: number }
    expect(meta.agentDelta).toBeCloseTo(state.currentPrice * 0.02, 6)
    expect(Math.abs(meta.engineDelta)).toBeLessThan(state.currentPrice * params.maxTickChange)

    // O impacto bruto do agente aparece como layer pre-cap (auditavel):
    const agentLayer = r.layerResults.find((l) => l.layer === 'L7_9_AgentImpact')!
    expect(agentLayer).toBeDefined()
    expect(agentLayer.deltaPrice).toBeCloseTo(state.currentPrice * 0.02, 6)
  })

  test('o agente entra UMA vez: newPrice = pre-agente + contribuicao CAPADA (impacto positivo)', () => {
    const state = baseState()
    const params = baseParams()
    const r = calculator.calculate(state, params, 0, undefined, 0.02)

    // motor quieto (noise 0, ancora neutra): enginePrice ~ currentPrice.
    expect(Math.abs(r.enginePrice - state.currentPrice) / state.currentPrice).toBeLessThan(
      params.maxTickChange,
    )
    // o agente sobe o preco publicado acima do pre-agente.
    expect(r.newPrice).toBeGreaterThan(r.enginePrice)
    // a contribuicao do agente e positiva e MENOR que o nominal de 2% (foi capada):
    const agentContribFrac = (r.newPrice - r.enginePrice) / state.currentPrice
    expect(agentContribFrac).toBeGreaterThan(0)
    expect(agentContribFrac).toBeLessThan(0.02)
  })

  test('impacto negativo do agente tambem e capado e derruba o preco publicado', () => {
    const state = baseState()
    const params = baseParams()
    const r = calculator.calculate(state, params, 0, undefined, -0.02)

    const move = Math.abs(r.newPrice - state.currentPrice) / state.currentPrice
    expect(move).toBeLessThanOrEqual(params.maxTickChange + EPS)
    expect(r.newPrice).toBeGreaterThanOrEqual(1) // floor NUDGE_MIN_PRICE
    expect(r.newPrice).toBeLessThan(r.enginePrice)
  })

  test('L10 (circuit breaker) roda no caminho com agente e o cap impede halt espurio do agente', () => {
    const state = baseState()
    const params = baseParams()
    // Impacto enorme (muito acima do cap ±2% do orquestrador): nao pode disparar o CB
    // sozinho porque L8 limita o movimento a 0.35%/tick, longe da banda de 8%.
    const r = calculator.calculate(state, params, 0, undefined, 0.5)

    expect(r.halted).toBe(false)
    const move = Math.abs(r.newPrice - state.currentPrice) / state.currentPrice
    expect(move).toBeLessThanOrEqual(params.maxTickChange + EPS)
    // O CB sempre roda no pipeline (nao e pulado pelo caminho do agente):
    expect(r.layerResults.find((l) => l.layer === 'L10_CircuitBreaker')).toBeDefined()
  })
})
