/**
 * @jest-environment node
 */
import { L1_OrnsteinUhlenbeck } from '../../layers/L1_OrnsteinUhlenbeck'
import type { AssetState, ClusterParams } from '../../../types/motor.types'

const baseState = (): AssetState => ({
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

describe('L1_OrnsteinUhlenbeck', () => {
  const l1 = new L1_OrnsteinUhlenbeck()

  test('noise zero retorna delta zero', () => {
    const result = l1.applyLayer(baseState(), params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('noise positivo gera delta positivo com sigma > 0', () => {
    const result = l1.applyLayer(baseState(), params(), 1.5)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('noise negativo gera delta negativo', () => {
    const result = l1.applyLayer(baseState(), params(), -1.5)
    expect(result.deltaPrice).toBeLessThan(0)
  })

  test('preço zero retorna delta zero', () => {
    const state = baseState()
    state.currentPrice = 0
    const result = l1.applyLayer(state, params(), 2.0)
    expect(result.deltaPrice).toBe(0)
  })

  test('dailySigmaMultiplier=0 congela volatilidade (delta zero para qualquer noise)', () => {
    const state = baseState()
    state.dailySigmaMultiplier = 0
    const result = l1.applyLayer(state, params(), 5.0)
    expect(result.deltaPrice).toBe(0)
  })

  test('dailySigmaMultiplier=0.5 reduz delta pela metade', () => {
    const state1 = baseState()
    state1.dailySigmaMultiplier = 1.0
    const result1 = l1.applyLayer(state1, params(), 1.0)

    const state2 = baseState()
    state2.dailySigmaMultiplier = 0.5
    const result2 = l1.applyLayer(state2, params(), 1.0)

    expect(result2.deltaPrice).toBeCloseTo(result1.deltaPrice * 0.5, 10)
  })

  test('delta é proporcional ao preço atual', () => {
    const state1 = baseState()
    state1.currentPrice = 50

    const state2 = baseState()
    state2.currentPrice = 200

    const r1 = l1.applyLayer(state1, params(), 1.0)
    const r2 = l1.applyLayer(state2, params(), 1.0)

    expect(r2.deltaPrice / r1.deltaPrice).toBeCloseTo(4, 5)
  })

  test('layer name é L1_OrnsteinUhlenbeck', () => {
    const result = l1.applyLayer(baseState(), params(), 0)
    expect(result.layer).toBe('L1_OrnsteinUhlenbeck')
  })

  test('metadata contém sigma, sigmaEff, noise', () => {
    const result = l1.applyLayer(baseState(), params(), 1.0)
    expect(result.metadata).toMatchObject({
      sigma: expect.any(Number),
      sigmaEff: expect.any(Number),
      noise: 1.0,
    })
  })
})
