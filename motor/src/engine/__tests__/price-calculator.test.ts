import { PriceCalculator } from '../PriceCalculator'
import type { AssetState, ClusterParams } from '../../types/motor.types'

const baseState = (): AssetState => ({
  id: 'asset_001',
  ticker: 'FLM3',
  cluster: 'A_TOP',
  currentPrice: 28.00,
  openPrice: 28.00,
  highPrice: 28.00,
  lowPrice: 28.00,
  closePrice: 28.00,
  fairValue: 28.00,
  volume: 50000,
  variance: 0.0001,
  pendingBuyVolume: 0,
  pendingSellVolume: 0,
  isPaused: false,
  newsImpact: 0,
  newsImpactTicks: 0,
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
  maxTickChange: 0.0035,
  ofiDecay: 0.91,
})

describe('PriceCalculator (integração)', () => {
  let calculator: PriceCalculator

  beforeEach(() => {
    calculator = new PriceCalculator()
  })

  test('retorna preço atual se ativo está pausado (isPaused=true)', () => {
    const state = baseState()
    state.isPaused = true
    const result = calculator.calculate(state, baseParams(), 0)
    expect(result.halted).toBe(true)
    expect(result.newPrice).toBe(28.00)
    expect(result.layerResults).toHaveLength(0)
  })

  test('circuit breaker (L9) interrompe pipeline se variação >= 8%', () => {
    const state = baseState()
    state.currentPrice = 30.25  // ~8.04% acima do closePrice 28.00
    const result = calculator.calculate(state, baseParams(), 0)
    expect(result.halted).toBe(true)
    expect(state.isPaused).toBe(true)
    expect(result.layerResults[0].layer).toBe('L9_CircuitBreaker')
  })

  test('com noise=0 e sem ordens pendentes: delta próximo de zero', () => {
    const state = baseState()
    const result = calculator.calculate(state, baseParams(), 0)
    expect(result.halted).toBe(false)
    expect(result.newPrice).toBeCloseTo(28.00, 4)
  })

  test('velocity cap limita delta acima de maxTickChange (2% para A_TOP)', () => {
    const state = baseState()
    state.newsImpact = 0.5
    state.newsImpactTicks = 10
    // Força ruído alto para exceder cap
    const result = calculator.calculate(state, baseParams(), 10.0)
    const changePercent = Math.abs(result.newPrice - 28.00) / 28.00
    expect(changePercent).toBeLessThanOrEqual(0.021)  // max 2% com margem
  })

  test('preço nunca vai abaixo de 0.01', () => {
    const state = baseState()
    state.currentPrice = 0.02
    state.closePrice = 0.02
    const result = calculator.calculate(state, baseParams(), -100.0)
    expect(result.newPrice).toBeGreaterThanOrEqual(0.01)
  })

  test('layerResults contém L9 + L1-L7 + L8 (9 entradas total)', () => {
    const state = baseState()
    const result = calculator.calculate(state, baseParams(), 0)
    expect(result.layerResults).toHaveLength(9)  // L9 + 7 layers + L8
  })
})
