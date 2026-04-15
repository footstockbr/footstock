import { PriceCalculator } from '../PriceCalculator'
import type { AssetState, ClusterParams } from '../../types/motor.types'

const baseState = (): AssetState => ({
  id: 'asset_001',
  ticker: 'FLM3',
  cluster: 'A_TOP',
  state: 'SP',
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
  maxTickChange: 0.0035,
  ofiDecay: 0.91,
  alphaOfi: 0.0005,
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

  test('circuit breaker (L10) interrompe pipeline se variação >= 8%', () => {
    const state = baseState()
    state.currentPrice = 30.80  // ~10% acima do closePrice 28.00 — margem suficiente pós-L2 (-0.3%)
    const result = calculator.calculate(state, baseParams(), 0)
    expect(result.halted).toBe(true)
    expect(state.isPaused).toBe(true)
    // L10 é o último layer no pipeline (trigger após L1-L9)
    const cbResult = result.layerResults.find(r => r.layer === 'L10_CircuitBreaker')
    expect(cbResult).toBeDefined()
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

  test('layerResults contém todas as camadas do pipeline (L9+L1-L7+L8+L10 = 10 entradas mínimo)', () => {
    const state = baseState()
    const result = calculator.calculate(state, baseParams(), 0)
    // Pipeline: L9_DailyVolTarget + L1-L7 (7 layers) + L8_VelocityCap + L10_CircuitBreaker = 10
    expect(result.layerResults.length).toBeGreaterThanOrEqual(10)
    const layerNames = result.layerResults.map(r => r.layer)
    expect(layerNames).toContain('L9_DailyVolTarget')
    expect(layerNames).toContain('L1_OrnsteinUhlenbeck')
    expect(layerNames).toContain('L8_VelocityCap')
    expect(layerNames).toContain('L10_CircuitBreaker')
  })
})
