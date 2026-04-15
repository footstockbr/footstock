/**
 * @jest-environment node
 */
import { L5_KyleLambda } from '../../layers/L5_KyleLambda'
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
  pendingBuyVolume: 1000,
  pendingSellVolume: 500,
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

const params = (overrides: Partial<ClusterParams> = {}): ClusterParams => ({
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
  ...overrides,
})

describe('L5_KyleLambda', () => {
  const l5 = new L5_KyleLambda()

  test('volume zero retorna delta zero', () => {
    const state = baseState({ pendingBuyVolume: 0, pendingSellVolume: 0 })
    const result = l5.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('compras dominantes geram delta positivo', () => {
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const result = l5.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('vendas dominantes geram delta negativo', () => {
    const state = baseState({ pendingBuyVolume: 0, pendingSellVolume: 1000 })
    const result = l5.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBeLessThan(0)
  })

  test('assimetria: compras sobem mais que vendas baixam (mesma magnitude)', () => {
    const buyState  = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const sellState = baseState({ pendingBuyVolume: 0, pendingSellVolume: 1000 })

    const buyDelta  = l5.applyLayer(buyState, params(), 0).deltaPrice
    const sellDelta = l5.applyLayer(sellState, params(), 0).deltaPrice

    // Compra deve ter impacto maior em módulo (assimetria > 1.0)
    expect(Math.abs(buyDelta)).toBeGreaterThan(Math.abs(sellDelta))
  })

  test('lambda maior gera impacto maior', () => {
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const low  = l5.applyLayer(state, params({ lambdaKyle: 0.0001 }), 0)
    const high = l5.applyLayer(state, params({ lambdaKyle: 0.001 }), 0)
    expect(Math.abs(high.deltaPrice)).toBeGreaterThan(Math.abs(low.deltaPrice))
  })

  test('assimetria metadata presente', () => {
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const result = l5.applyLayer(state, params(), 0)
    expect(result.metadata?.asymmetry).toBeGreaterThan(1.0)
    expect(result.metadata?.isBuyDominant).toBe(1)
  })

  test('layer name é L5_KyleLambda', () => {
    const result = l5.applyLayer(baseState(), params(), 0)
    expect(result.layer).toBe('L5_KyleLambda')
  })
})
