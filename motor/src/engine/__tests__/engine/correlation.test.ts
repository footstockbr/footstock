/**
 * @jest-environment node
 */
import { CorrelationLayer, correlationLayer } from '../../CorrelationLayer'
import type { AssetState, PreviousTickDelta } from '../../../types/motor.types'

const baseState = (overrides: Partial<AssetState> = {}): AssetState => ({
  id: 'asset-001',
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

const makeDelta = (cluster: string, state: string, deltaPercent: number): PreviousTickDelta => ({
  cluster: cluster as PreviousTickDelta['cluster'],
  state,
  deltaPercent,
})

describe('CorrelationLayer', () => {
  const cl = new CorrelationLayer()

  test('sem pares: delta = 0', () => {
    const state   = baseState()
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0.01)],  // só o próprio ativo
    ])
    const result = cl.compute(state, deltas)
    expect(result.delta).toBe(0)
    expect(result.clusterPeers).toBe(0)
  })

  test('pares do mesmo cluster contribuem com correlação positiva', () => {
    const state   = baseState()
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0.01)],
      ['asset-002', makeDelta('A_TOP', 'RJ', 0.02)],  // mesmo cluster, diferente estado
      ['asset-003', makeDelta('A_TOP', 'MG', 0.01)],
    ])
    const result = cl.compute(state, deltas)
    // Pares subiram → correlação positiva → delta > 0
    expect(result.delta).toBeGreaterThan(0)
    expect(result.clusterPeers).toBe(2)
  })

  test('pares do mesmo cluster com queda: delta negativo', () => {
    const state   = baseState()
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', -0.01)],
      ['asset-002', makeDelta('A_TOP', 'RJ', -0.02)],
      ['asset-003', makeDelta('A_TOP', 'MG', -0.01)],
    ])
    const result = cl.compute(state, deltas)
    expect(result.delta).toBeLessThan(0)
  })

  test('clusters diferentes NÃO se correlacionam', () => {
    const state   = baseState({ cluster: 'A_TOP' })
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0)],
      ['asset-002', makeDelta('B_ILLIQ', 'SP', 0.50)],  // cluster diferente, grande movimento
    ])
    const result = cl.compute(state, deltas)
    // B_ILLIQ não correlaciona com A_TOP
    expect(result.clusterPeers).toBe(0)
  })

  test('correlação regional: mesmo estado adiciona delta extra', () => {
    const state = baseState({ state: 'SP' })
    const deltas = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0)],
      ['asset-002', makeDelta('A_MID', 'SP', 0.01)],   // mesmo estado, diferente cluster
    ])
    const result = cl.compute(state, deltas)
    // Apenas correlação regional (sem cluster peers)
    expect(result.regionalPeers).toBeGreaterThan(0)
  })

  test('delta de correlação respeita velocity cap (~0.07% do preço)', () => {
    const state   = baseState({ currentPrice: 100 })
    const deltas  = new Map<string, PreviousTickDelta>([
      ['asset-001', makeDelta('A_TOP', 'SP', 0)],
      ['asset-002', makeDelta('A_TOP', 'RJ', 1.0)],    // 100% de variação — extremo
    ])
    const result = cl.compute(state, deltas)
    // Cap: ~0.07% de 100 = 0.07
    expect(Math.abs(result.delta)).toBeLessThanOrEqual(0.07 + 1e-10)
  })

  test('singleton correlationLayer funciona como instância compartilhada', () => {
    const state  = baseState()
    const deltas = new Map<string, PreviousTickDelta>()
    const result = correlationLayer.compute(state, deltas)
    expect(result.delta).toBe(0)
  })

  test('rho por cluster: A_TOP=0.35, A_SMALL=0.08, B_ILLIQ=0.05', () => {
    const stateA = baseState({ cluster: 'A_TOP' })
    const stateS = baseState({ cluster: 'A_SMALL' })
    const stateB = baseState({ cluster: 'B_ILLIQ' })

    const deltasA = new Map([
      ['own', makeDelta('A_TOP',   'SP', 0)],
      ['p1',  makeDelta('A_TOP',   'RJ', 0.01)],
    ])
    const deltasS = new Map([
      ['own', makeDelta('A_SMALL', 'SP', 0)],
      ['p1',  makeDelta('A_SMALL', 'RJ', 0.01)],
    ])
    const deltasB = new Map([
      ['own', makeDelta('B_ILLIQ', 'SP', 0)],
      ['p1',  makeDelta('B_ILLIQ', 'RJ', 0.01)],
    ])

    const rA = cl.compute(stateA, deltasA)
    const rS = cl.compute(stateS, deltasS)
    const rB = cl.compute(stateB, deltasB)

    // A_TOP tem rho maior → delta maior que A_SMALL e B_ILLIQ
    expect(rA.clusterRho).toBe(0.35)
    expect(rS.clusterRho).toBe(0.08)
    expect(rB.clusterRho).toBe(0.05)
  })
})
