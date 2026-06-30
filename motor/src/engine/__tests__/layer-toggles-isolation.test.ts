import { PriceCalculator } from '../PriceCalculator'
import type { AssetState, ClusterParams } from '../../types/motor.types'

const L1_L7_TOGGLES = [
  ['ou', 'L1_OrnsteinUhlenbeck'],
  ['fundamentalReversion', 'L2_FundamentalAnchor'],
  ['garch', 'L3_GARCHLite'],
  ['ofi', 'L4_OrderFlowImbalance'],
  ['kylesLambda', 'L5_KyleLambda'],
  ['supplyScaling', 'L6_SupplyScaling'],
  ['pressureQueue', 'L7_PressureQueue'],
] as const

function baseState(overrides: Partial<AssetState> = {}): AssetState {
  return {
    id: 'asset-001',
    ticker: 'TST3',
    cluster: 'A_TOP',
    state: 'SP',
    currentPrice: 100,
    openPrice: 100,
    highPrice: 100,
    lowPrice: 100,
    closePrice: 100,
    fairValue: 100,
    volume: 50_000,
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
    dailySigmaMultiplier: 1,
    volatilityMultiplier: 1,
    ticksSinceLastChange: 0,
    ...overrides,
  }
}

function baseParams(overrides: Partial<ClusterParams> = {}): ClusterParams {
  return {
    cluster: 'A_TOP',
    baseVolume: 50_000,
    drift: 0,
    theta: 0.12,
    sigma: 0.0018,
    garchAlpha: 0.12,
    garchBeta: 0.85,
    lambdaKyle: 0.0001,
    spread: 0.0005,
    maxTickChange: 0.0035,
    ofiDecay: 0.91,
    alphaOfi: 0.0003,
    fundamentalReversionRate: 0.003,
    circuitBreakerThreshold: 0.08,
    circuitBreakerEnabled: true,
    layersEnabled: {},
    ...overrides,
  }
}

describe('PriceCalculator layerToggles L1-L7', () => {
  test.each(L1_L7_TOGGLES)('%s=false registra %s desabilitada com delta zero', (toggleKey, layerName) => {
    const calculator = new PriceCalculator()
    const state = baseState()
    const params = baseParams({ layersEnabled: { [toggleKey]: false } })

    const result = calculator.calculate(state, params, 0)
    const layer = result.layerResults.find((entry) => entry.layer === layerName)

    expect(layer).toBeDefined()
    expect(layer?.deltaPrice).toBe(0)
    expect(layer?.metadata?.disabled).toBe(1)
  })

  test('todos os toggles L1-L7 off, sem agente, sem correlacao e sem nudge pronto mantem preco estavel', () => {
    const calculator = new PriceCalculator()
    const state = baseState({ ticksSinceLastChange: 0 })
    const params = baseParams({
      layersEnabled: Object.fromEntries(L1_L7_TOGGLES.map(([key]) => [key, false])),
    })

    const result = calculator.calculate(state, params, 0)

    expect(result.newPrice).toBe(state.currentPrice)
    expect(result.enginePrice).toBe(state.currentPrice)
    expect(result.halted).toBe(false)
    for (const [, layerName] of L1_L7_TOGGLES) {
      const layer = result.layerResults.find((entry) => entry.layer === layerName)
      expect(layer?.metadata?.disabled).toBe(1)
      expect(layer?.deltaPrice).toBe(0)
    }
  })

  test('layerToggles nao derivam state.isPaused nem congelamento completo do pipeline', () => {
    const calculator = new PriceCalculator()
    const state = baseState({ isPaused: false })
    const params = baseParams({
      layersEnabled: Object.fromEntries(L1_L7_TOGGLES.map(([key]) => [key, false])),
    })

    const result = calculator.calculate(state, params, 0)

    expect(state.isPaused).toBe(false)
    expect(result.halted).toBe(false)
    expect(result.layerResults).not.toHaveLength(0)

    state.isPaused = true
    const paused = calculator.calculate(state, params, 0)
    expect(paused.halted).toBe(true)
    expect(paused.newPrice).toBe(state.currentPrice)
    expect(paused.layerResults).toHaveLength(0)
  })
})
