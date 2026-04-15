/**
 * @jest-environment node
 */
import { L1_OrderUnbalance } from '../L1_OrderUnbalance'
import { L2_Anchor } from '../L2_Anchor'
import { L3_GARCH } from '../L3_GARCH'
import { L4_OFI } from '../L4_OFI'
import { L5_KyleLambda } from '../L5_KyleLambda'
import { L6_SupplyScaling } from '../L6_SupplyScaling'
import { L7_PressureQueue } from '../L7_PressureQueue'
import { L9_CircuitBreaker } from '../L9_CircuitBreaker'
import type { AssetState, ClusterParams } from '../../../types/motor.types'

const mockState = (overrides: Partial<AssetState> = {}): AssetState => ({
  id: 'asset_001',
  ticker: 'FLM3',
  cluster: 'A_TOP',
  state: 'SP',
  currentPrice: 28.50,
  openPrice: 28.00,
  highPrice: 29.00,
  lowPrice: 27.50,
  closePrice: 28.00,
  fairValue: 28.00,
  volume: 50000,
  variance: 0.0001,
  pendingBuyVolume: 1000,
  pendingSellVolume: 800,
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

const mockParams = (overrides: Partial<ClusterParams> = {}): ClusterParams => ({
  cluster: 'A_TOP',
  baseVolume: 50000,
  drift: 0.0,
  theta: 0.12,
  sigma: 0.0018,
  garchAlpha: 0.12,
  garchBeta: 0.85,
  lambdaKyle: 0.0001,
  spread: 0.0005,
  maxTickChange: 0.0035,
  ofiDecay: 0.91,
  alphaOfi: 0.0005,
  ...overrides,
})

describe('L1_OrderUnbalance', () => {
  const l1 = new L1_OrderUnbalance()

  test('compras > vendas gera delta positivo', () => {
    const state = mockState({ pendingBuyVolume: 1000, pendingSellVolume: 500 })
    const result = l1.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('vendas > compras gera delta negativo', () => {
    const state = mockState({ pendingBuyVolume: 500, pendingSellVolume: 1000 })
    const result = l1.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBeLessThan(0)
  })

  test('zero volume retorna delta zero', () => {
    const state = mockState({ pendingBuyVolume: 0, pendingSellVolume: 0 })
    const result = l1.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBe(0)
  })
})

describe('L2_Anchor', () => {
  const l2 = new L2_Anchor()

  test('preço acima do close gera delta negativo (reversão)', () => {
    const state = mockState({ currentPrice: 30.00, closePrice: 28.00 })
    const result = l2.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBeLessThan(0)
  })

  test('preço igual ao close gera delta zero', () => {
    const state = mockState({ currentPrice: 28.00, closePrice: 28.00 })
    const result = l2.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBe(0)
  })
})

describe('L3_GARCH', () => {
  const l3 = new L3_GARCH()

  test('noise positivo gera delta positivo', () => {
    const state = mockState()
    const result = l3.applyLayer(state, mockParams(), 1.0)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('noise zero gera delta zero', () => {
    const state = mockState()
    const result = l3.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('variância atualizada no estado', () => {
    const state = mockState({ variance: 0.0001 })
    l3.applyLayer(state, mockParams(), 0.5)
    expect(state.variance).not.toBe(0.0001)
  })
})

describe('L4_OFI', () => {
  const l4 = new L4_OFI()

  test('fluxo comprador gera delta positivo', () => {
    const state = mockState({ pendingBuyVolume: 2000, pendingSellVolume: 0 })
    const result = l4.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })
})

describe('L5_KyleLambda', () => {
  const l5 = new L5_KyleLambda()

  test('volume zero gera delta zero', () => {
    const state = mockState({ pendingBuyVolume: 0, pendingSellVolume: 0 })
    const result = l5.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('lambda maior gera impacto maior', () => {
    const state = mockState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const low = l5.applyLayer(state, mockParams({ lambdaKyle: 0.0001 }), 0)
    const high = l5.applyLayer(state, mockParams({ lambdaKyle: 0.001 }), 0)
    expect(Math.abs(high.deltaPrice)).toBeGreaterThan(Math.abs(low.deltaPrice))
  })
})

describe('L6_SupplyScaling', () => {
  const l6 = new L6_SupplyScaling()

  test('drift zero retorna delta zero', () => {
    const state = mockState()
    const result = l6.applyLayer(state, mockParams({ drift: 0.0 }), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('drift positivo gera delta positivo proporcional ao preço', () => {
    // volume=0 → amplification=1 → deltaPrice = drift * price * 1
    const state = mockState({ currentPrice: 100, volume: 0 })
    const result = l6.applyLayer(state, mockParams({ drift: 0.001 }), 0)
    expect(result.deltaPrice).toBeCloseTo(0.1)
  })

  test('drift negativo gera delta negativo (Série B menor liquidez)', () => {
    // volume=0 → amplification=1 → deltaPrice = drift * price * 1
    const state = mockState({ currentPrice: 50, volume: 0 })
    const result = l6.applyLayer(state, mockParams({ drift: -0.002 }), 0)
    expect(result.deltaPrice).toBeCloseTo(-0.1)
  })
})

describe('L7_PressureQueue', () => {
  const l7 = new L7_PressureQueue()

  test('sem newsImpact retorna delta zero', () => {
    const state = mockState({ newsImpact: 0, newsImpactTicks: 0 })
    const result = l7.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('newsImpact positivo gera delta positivo', () => {
    const state = mockState({ newsImpact: 0.5, newsImpactTicks: 10, currentPrice: 100 })
    const result = l7.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('decrementa newsImpactTicks a cada aplicação', () => {
    const state = mockState({ newsImpact: 0.3, newsImpactTicks: 5 })
    l7.applyLayer(state, mockParams(), 0)
    expect(state.newsImpactTicks).toBe(4)
  })

  test('newsImpact negativo gera delta negativo', () => {
    const state = mockState({ newsImpact: -0.4, newsImpactTicks: 8, currentPrice: 50 })
    const result = l7.applyLayer(state, mockParams(), 0)
    expect(result.deltaPrice).toBeLessThan(0)
  })
})

describe('L9_CircuitBreaker', () => {
  const l9 = new L9_CircuitBreaker()

  test('não ativa com variação de 5%', () => {
    const state = mockState({ currentPrice: 29.40, closePrice: 28.00 })
    const result = l9.applyLayer(state, mockParams(), 0) as any
    expect(result.triggered).toBe(false)
    expect(state.isPaused).toBe(false)
  })

  test('ativa com variação de 10%', () => {
    const state = mockState({ currentPrice: 30.80, closePrice: 28.00 })
    const result = l9.applyLayer(state, mockParams(), 0) as any
    expect(result.triggered).toBe(true)
    expect(state.isPaused).toBe(true)
  })
})
