import { PriceCalculator } from '../PriceCalculator'
import { NUDGE_TICKS } from '../nudge-constants'
import type { AssetState, ClusterParams, PreviousTickDelta } from '../../types/motor.types'

const ALL_MAIN_LAYERS_OFF = {
  ou: false,
  fundamentalReversion: false,
  garch: false,
  ofi: false,
  kylesLambda: false,
  supplyScaling: false,
  pressureQueue: false,
}

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
    layersEnabled: ALL_MAIN_LAYERS_OFF,
    ...overrides,
  }
}

const peerDelta = (cluster: PreviousTickDelta['cluster'], state: string, deltaPercent: number): PreviousTickDelta => ({
  cluster,
  state,
  deltaPercent,
})

describe('PriceCalculator fontes residuais fora dos toggles L1-L7', () => {
  test('camadas off nao sao kill switch: agentImpact move preco por L7_9_AgentImpact', () => {
    const result = new PriceCalculator().calculate(baseState(), baseParams(), 0, undefined, 0.02)
    const agent = result.layerResults.find((entry) => entry.layer === 'L7_9_AgentImpact')

    expect('camadas off nao sao kill switch').toBe('camadas off nao sao kill switch')
    expect(agent).toBeDefined()
    expect(agent?.deltaPrice).toBe(2)
    expect(result.newPrice).toBeGreaterThan(100)
  })

  test('camadas off nao sao kill switch: previousDeltas move preco por L10_Correlation', () => {
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-001', peerDelta('A_TOP', 'SP', 0)],
      ['asset-002', peerDelta('A_TOP', 'RJ', 0.02)],
      ['asset-003', peerDelta('A_TOP', 'MG', 0.01)],
    ])

    const result = new PriceCalculator().calculate(baseState(), baseParams(), 0, deltas)
    const correlation = result.layerResults.find((entry) => entry.layer === 'L10_Correlation')

    expect(correlation).toBeDefined()
    expect(correlation?.deltaPrice).toBeGreaterThan(0)
    expect(result.newPrice).toBeGreaterThan(100)
  })

  test('pressureQueue=false desliga L7_5_Nudge e limpa contador oculto', () => {
    const state = baseState({ fairValue: 101, ticksSinceLastChange: NUDGE_TICKS - 1 })
    const result = new PriceCalculator().calculate(state, baseParams(), 0)
    const nudge = result.layerResults.find((entry) => entry.layer === 'L7_5_Nudge')

    expect(nudge).toBeDefined()
    expect(nudge?.deltaPrice).toBe(0)
    expect(nudge?.metadata?.disabled).toBe(1)
    expect(nudge?.metadata?.controlledBy).toBe('pressureQueue')
    expect(state.ticksSinceLastChange).toBe(0)
    expect(result.newPrice).toBe(100)
  })

  test('pressureQueue=true preserva L7_5_Nudge mesmo com L1-L6 desligadas', () => {
    const state = baseState({ fairValue: 101, ticksSinceLastChange: NUDGE_TICKS - 1 })
    const result = new PriceCalculator().calculate(
      state,
      baseParams({ layersEnabled: { ...ALL_MAIN_LAYERS_OFF, pressureQueue: true } }),
      0,
    )
    const nudge = result.layerResults.find((entry) => entry.layer === 'L7_5_Nudge')

    expect(nudge).toBeDefined()
    expect(nudge?.deltaPrice).toBeGreaterThan(0)
    expect(state.ticksSinceLastChange).toBe(0)
    expect(result.newPrice).toBeGreaterThan(100)
  })

  test('velocityCap=false remove cap e nao zera delta residual', () => {
    const result = new PriceCalculator().calculate(
      baseState(),
      baseParams({ layersEnabled: { ...ALL_MAIN_LAYERS_OFF, velocityCap: false } }),
      0,
      undefined,
      0.02,
    )
    const cap = result.layerResults.find((entry) => entry.layer === 'L8_VelocityCap')

    expect(cap?.metadata?.originalDelta).toBe(2)
    expect(cap?.metadata?.cappedDelta).toBe(2)
    expect(cap?.deltaPrice).toBe(0)
    expect(result.newPrice).toBeCloseTo(102, 6)
  })

  test('circuitBreaker.enabled=false desliga L10_CircuitBreaker e remove L9_5_ApproachBrake', () => {
    const result = new PriceCalculator().calculate(
      baseState({ currentPrice: 107, highPrice: 107, lowPrice: 107, closePrice: 100 }),
      baseParams({
        circuitBreakerEnabled: false,
        layersEnabled: { ...ALL_MAIN_LAYERS_OFF, velocityCap: false },
      }),
      0,
      undefined,
      0.01,
    )
    const cb = result.layerResults.find((entry) => entry.layer === 'L10_CircuitBreaker')
    const brake = result.layerResults.find((entry) => entry.layer === 'L9_5_ApproachBrake')

    expect((cb as { triggered?: boolean } | undefined)?.triggered).toBe(false)
    expect(brake).toBeUndefined()
    expect(result.halted).toBe(false)
    expect(result.newPrice).toBeGreaterThan(107)
  })
})
