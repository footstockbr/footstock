/**
 * @jest-environment node
 */
import { L9_DailyVolTarget } from '../../layers/L9_DailyVolTarget'
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

describe('L9_DailyVolTarget', () => {
  const l9 = new L9_DailyVolTarget()

  test('dailyVolAccum < 2.0%: sigmaMultiplier = 1.0 (operação normal)', () => {
    const state = baseState({ dailyVolAccum: 0.015 })  // 1.5%
    l9.applyLayer(state, params(), 0)
    expect(state.dailySigmaMultiplier).toBe(1.0)
  })

  test('dailyVolAccum = 2.5%: sigmaMultiplier = 0.0 (freeze)', () => {
    const state = baseState({ dailyVolAccum: 0.025 })
    l9.applyLayer(state, params(), 0)
    expect(state.dailySigmaMultiplier).toBe(0.0)
  })

  test('dailyVolAccum > 2.5%: continua freeze (sigmaMultiplier = 0.0)', () => {
    const state = baseState({ dailyVolAccum: 0.04 })
    l9.applyLayer(state, params(), 0)
    expect(state.dailySigmaMultiplier).toBe(0.0)
  })

  test('dailyVolAccum entre 2.0% e 2.5%: redução gradual de sigma', () => {
    const state = baseState({ dailyVolAccum: 0.022 })  // 2.2% = 40% do caminho
    l9.applyLayer(state, params(), 0)
    expect(state.dailySigmaMultiplier).toBeGreaterThan(0.0)
    expect(state.dailySigmaMultiplier).toBeLessThan(1.0)
  })

  test('reducao é monotônica: mais vol = menor sigma', () => {
    const s1 = baseState({ dailyVolAccum: 0.020 })
    const s2 = baseState({ dailyVolAccum: 0.022 })
    const s3 = baseState({ dailyVolAccum: 0.024 })

    l9.applyLayer(s1, params(), 0)
    l9.applyLayer(s2, params(), 0)
    l9.applyLayer(s3, params(), 0)

    expect(s1.dailySigmaMultiplier).toBeGreaterThanOrEqual(s2.dailySigmaMultiplier)
    expect(s2.dailySigmaMultiplier).toBeGreaterThanOrEqual(s3.dailySigmaMultiplier)
  })

  test('applyLayer retorna deltaPrice=0 (L9 é modificador)', () => {
    const state = baseState({ dailyVolAccum: 0.01 })
    const result = l9.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('accumulate: adiciona variação fracional ao dailyVolAccum', () => {
    const state = baseState({ dailyVolAccum: 0.01 })
    l9.accumulate(state, 0.003)  // +0.3%
    expect(state.dailyVolAccum).toBeCloseTo(0.013, 10)
  })

  test('accumulate: usa valor absoluto (não importa sinal)', () => {
    const s1 = baseState({ dailyVolAccum: 0 })
    const s2 = baseState({ dailyVolAccum: 0 })

    l9.accumulate(s1, 0.005)
    l9.accumulate(s2, -0.005)

    expect(s1.dailyVolAccum).toBe(s2.dailyVolAccum)
  })

  test('resetForSession: zera acumulador e restaura sigmaMultiplier = 1.0', () => {
    const state = baseState({ dailyVolAccum: 0.03, dailySigmaMultiplier: 0.0 })
    l9.resetForSession(state)
    expect(state.dailyVolAccum).toBe(0)
    expect(state.dailySigmaMultiplier).toBe(1.0)
  })

  test('metadata contém dailyVol, sigmaMultiplier, frozen', () => {
    const state = baseState({ dailyVolAccum: 0.026 })
    const result = l9.applyLayer(state, params(), 0)
    expect(result.metadata?.dailyVol).toBeCloseTo(0.026)
    expect(result.metadata?.frozen).toBe(1)
    expect(result.metadata?.sigmaMultiplier).toBe(0.0)
  })

  test('layer name é L9_DailyVolTarget', () => {
    const result = l9.applyLayer(baseState(), params(), 0)
    expect(result.layer).toBe('L9_DailyVolTarget')
  })
})
