/**
 * @jest-environment node
 */
import { L6_SupplyScaling } from '../../layers/L6_SupplyScaling'
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

const params = (overrides: Partial<ClusterParams> = {}): ClusterParams => ({
  cluster: 'A_TOP',
  baseVolume: 50_000,
  drift: 0.001,
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

describe('L6_SupplyScaling', () => {
  const l6 = new L6_SupplyScaling()

  test('drift zero retorna delta zero independente do volume', () => {
    const state = baseState({ volume: 100_000 })
    const result = l6.applyLayer(state, params({ drift: 0 }), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('volume zero: amplificação = 1 (float 100% disponível)', () => {
    const state = baseState({ volume: 0 })
    const result = l6.applyLayer(state, params({ drift: 0.001 }), 0)
    expect(result.metadata?.amplification).toBeCloseTo(1.0, 5)
    expect(result.metadata?.floatAvailableRatio).toBeCloseTo(1.0, 5)
  })

  test('volume alto: amplificação próxima de 2 (float exaurido)', () => {
    // A_TOP: k=20, baseVolume=50000 → capacity=1_000_000
    // Volume = 1_000_000 → floatAvailableRatio ≈ 0 → amplification ≈ 2
    const state = baseState({ volume: 1_000_000 })
    const result = l6.applyLayer(state, params({ drift: 0.001 }), 0)
    expect(result.metadata?.amplification).toBeCloseTo(2.0, 1)
  })

  test('amplificação maior com volume maior (drift positivo)', () => {
    const state1 = baseState({ volume: 0 })
    const state2 = baseState({ volume: 500_000 })

    const r1 = l6.applyLayer(state1, params({ drift: 0.001 }), 0)
    const r2 = l6.applyLayer(state2, params({ drift: 0.001 }), 0)

    expect(r2.deltaPrice).toBeGreaterThan(r1.deltaPrice)
  })

  test('drift negativo gera delta negativo com amplificação', () => {
    const state = baseState({ volume: 500_000 })
    const result = l6.applyLayer(state, params({ drift: -0.001 }), 0)
    expect(result.deltaPrice).toBeLessThan(0)
  })

  test('metadata contém floatAvailableRatio e amplification', () => {
    const result = l6.applyLayer(baseState(), params(), 0)
    expect(result.metadata?.floatAvailableRatio).toBeDefined()
    expect(result.metadata?.amplification).toBeDefined()
  })

  test('layer name é L6_SupplyScaling', () => {
    const result = l6.applyLayer(baseState(), params(), 0)
    expect(result.layer).toBe('L6_SupplyScaling')
  })
})
