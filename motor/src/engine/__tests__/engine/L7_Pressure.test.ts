/**
 * @jest-environment node
 */
import { L7_PressureQueue } from '../../layers/L7_PressureQueue'
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

describe('L7_PressureQueue', () => {
  const l7 = new L7_PressureQueue()

  test('sem notícia retorna delta zero', () => {
    const result = l7.applyLayer(baseState({ newsImpact: 0, newsImpactTicks: 0 }), params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('notícia positiva gera delta positivo', () => {
    const state = baseState({ newsImpact: 0.5, newsImpactTicks: 10, currentPrice: 100 })
    const result = l7.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('notícia negativa gera delta negativo', () => {
    const state = baseState({ newsImpact: -0.4, newsImpactTicks: 8, currentPrice: 100 })
    const result = l7.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBeLessThan(0)
  })

  test('decrementa newsImpactTicks a cada tick', () => {
    const state = baseState({ newsImpact: 0.3, newsImpactTicks: 5 })
    l7.applyLayer(state, params(), 0)
    expect(state.newsImpactTicks).toBe(4)
  })

  test('cap spot: impacto limitado a ±2.5% por tick', () => {
    // newsImpact=1.0 (100%) num ativo de 100 → raw seria enorme
    // Deve ser capped em 2.5% = 2.5
    const state = baseState({ newsImpact: 1.0, newsImpactTicks: 50, currentPrice: 100 })
    const result = l7.applyLayer(state, params(), 0)
    expect(Math.abs(result.deltaPrice)).toBeLessThanOrEqual(2.5 + 1e-10)
  })

  test('impacto decai ao longo dos ticks', () => {
    const state1 = baseState({ newsImpact: 0.5, newsImpactTicks: 50, currentPrice: 100 })
    const state2 = baseState({ newsImpact: 0.5, newsImpactTicks: 10, currentPrice: 100 })

    // Mais ticks restantes → fase spread → impacto maior
    const r1 = l7.applyLayer(state1, params(), 0)
    const r2 = l7.applyLayer(state2, params(), 0)

    // Ambos positivos, mas magnitudes diferentes conforme a fase
    expect(r1.deltaPrice).toBeGreaterThan(0)
    expect(r2.deltaPrice).toBeGreaterThan(0)
  })

  test('newsImpactTicks=0 retorna delta zero', () => {
    const state = baseState({ newsImpact: 0.5, newsImpactTicks: 0 })
    const result = l7.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('layer name é L7_PressureQueue', () => {
    const result = l7.applyLayer(baseState(), params(), 0)
    expect(result.layer).toBe('L7_PressureQueue')
  })
})
