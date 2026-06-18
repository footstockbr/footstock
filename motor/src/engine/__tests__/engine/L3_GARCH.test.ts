/**
 * @jest-environment node
 */
import { L3_GARCHLite } from '../../layers/L3_GARCHLite'
import type { AssetState, ClusterParams } from '../../../types/motor.types'

const baseState = (overrides: Partial<AssetState> = {}): AssetState => ({
  id: 'a1',
  ticker: 'FLM3',
  cluster: 'A_TOP',
  state: 'SP',
  currentPrice: 100,
  openPrice: 100,
  highPrice: 100,
  lowPrice: 100,
  closePrice: 100,
  fairValue: 100,
  volume: 0,
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
  ...overrides,
})

const params = (): ClusterParams => ({
  cluster: 'A_TOP',
  baseVolume: 50_000,
  drift: 0,
  theta: 0.12,
  sigma: 0.001,
  garchAlpha: 0.12,
  garchBeta: 0.85,
  lambdaKyle: 0.0001,
  spread: 0.0005,
  maxTickChange: 0.0035,
  ofiDecay: 0.91,
  alphaOfi: 0.0005,
})

describe('L3_GARCHLite', () => {
  const l3 = new L3_GARCHLite()

  test('noise zero retorna delta zero', () => {
    const state = baseState()
    const result = l3.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('noise positivo gera delta positivo', () => {
    const state = baseState()
    const result = l3.applyLayer(state, params(), 1.5)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('atualiza variance no estado após cada tick', () => {
    const state = baseState({ variance: 0.0001, closePrice: 90, currentPrice: 100 })
    const varBefore = state.variance
    l3.applyLayer(state, params(), 1.0)
    expect(state.variance).not.toBe(varBefore)
  })

  test('variância não ultrapassa 1.8× a base (0.00018)', () => {
    const state = baseState({ variance: 0.001 })  // variância alta inicial
    const result = l3.applyLayer(state, params(), 5.0)
    expect(state.variance).toBeLessThanOrEqual(0.0001 * 1.8 + 1e-12)
    expect(result.metadata?.capped).toBe(1)
  })

  test('fórmula GARCH: Var_t = 0.000002 + 0.12*r² + 0.85*Var_{t-1} (r = retorno do tick anterior)', () => {
    const prevVariance = 0.0001
    const r = 0.02  // retorno tick-a-tick do tick anterior (NÃO acumulado do dia)
    const state = baseState({ lastTickReturn: r, variance: prevVariance })

    const expectedVariance = 0.000002 + 0.12 * r ** 2 + 0.85 * prevVariance

    l3.applyLayer(state, params(), 0)
    expect(state.variance).toBeCloseTo(Math.min(expectedVariance, 0.0001 * 1.8), 10)
  })

  test('T3.2 — garch.lastReturn == retorno do tick anterior (state.lastTickReturn), não vs close diário', () => {
    // closePrice distante de currentPrice produziria um retorno diário espúrio (~+11%)
    // se a L3 ainda usasse (currentPrice - closePrice)/closePrice. O valor correto é o
    // retorno tick-a-tick propagado pelo PriceCalculator (T3.1).
    const tickReturn = -0.0007
    const state = baseState({ lastTickReturn: tickReturn, closePrice: 90, currentPrice: 100 })

    const result = l3.applyLayer(state, params(), 0)
    expect(result.metadata?.lastReturn).toBeCloseTo(tickReturn, 12)
  })

  test('T3.2 — lastTickReturn ausente (primeiro tick pós-restart) => lastReturn 0', () => {
    const state = baseState({ closePrice: 90, currentPrice: 100 })  // sem lastTickReturn
    const result = l3.applyLayer(state, params(), 0)
    expect(result.metadata?.lastReturn).toBe(0)
  })

  test('T3.2/T3.3 — termo estocástico escala por √dt, consistente com L1 (default-safe legacy 5/390)', () => {
    const state = baseState({ variance: 0.0001 })
    const noise = 1.3
    const result = l3.applyLayer(state, params(), noise)

    const dt = Number(result.metadata?.dt)
    const sigmaEff = Number(result.metadata?.sigmaEff)
    // T3.3: MOTOR_TICK_DT_SECONDS ausente => default EXPLÍCITO legacy 5/390 (não mais 1.0 acidental).
    expect(dt).toBeCloseTo(5 / 390, 12)
    // deltaPrice = σ_eff × √dt × noise × P
    expect(result.deltaPrice).toBeCloseTo(sigmaEff * Math.sqrt(dt) * noise * state.currentPrice, 12)
  })

  test('T3.2 — √dt aplicado (não dt linear): dt=4 escala o ruído por 2×, não 4×', () => {
    const prev = process.env.MOTOR_TICK_DT_SECONDS
    process.env.MOTOR_TICK_DT_SECONDS = '4'
    jest.isolateModules(() => {
      // re-import com DT capturado em module-scope = 4 (mesmo padrão de L1_OU)
      const { L3_GARCHLite: L3Scaled } = require('../../layers/L3_GARCHLite')
      const l3Scaled = new L3Scaled()
      const noise = 1.0
      const state = baseState({ variance: 0.0001 })
      const result = l3Scaled.applyLayer(state, params(), noise)
      const sigmaEff = Number(result.metadata?.sigmaEff)
      expect(result.metadata?.dt).toBe(4)
      // √4 = 2 (não 4): prova que é √dt e não dt linear
      expect(result.deltaPrice).toBeCloseTo(sigmaEff * 2 * noise * state.currentPrice, 12)
    })
    if (prev === undefined) delete process.env.MOTOR_TICK_DT_SECONDS
    else process.env.MOTOR_TICK_DT_SECONDS = prev
  })

  test('dailySigmaMultiplier=0 congela GARCH (delta zero)', () => {
    const state = baseState({ dailySigmaMultiplier: 0 })
    const result = l3.applyLayer(state, params(), 3.0)
    expect(result.deltaPrice).toBe(0)
  })

  test('inicialização: variance=0 usa sigma_base² do cluster', () => {
    const state = baseState({ variance: 0 })
    const result = l3.applyLayer(state, params(), 1.0)
    // Deve ter processado normalmente sem NaN
    expect(result.deltaPrice).not.toBeNaN()
    expect(state.variance).toBeGreaterThan(0)
  })

  test('layer name é L3_GARCHLite', () => {
    const result = l3.applyLayer(baseState(), params(), 0)
    expect(result.layer).toBe('L3_GARCHLite')
  })
})
