/**
 * @jest-environment node
 */
import { L2_FundamentalAnchor } from '../../layers/L2_FundamentalAnchor'
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
  volatilityMultiplier: 1.0,
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

describe('L2_FundamentalAnchor', () => {
  const l2 = new L2_FundamentalAnchor()

  // T3.3: este suite valida a LÓGICA da âncora (cap 0,3%, sinal) com aritmética
  // calibrada em dt=1 (raw = θ×(FV−P)×dt). Fixa o dt no passo unitário de referência
  // para isolar a lógica do default-safe legacy (5/390). O default explícito é
  // coberto por engine/tick-dt.test.ts e pelo harness (Item T3.3).
  let prevDt: string | undefined
  beforeAll(() => {
    prevDt = process.env.MOTOR_TICK_DT_SECONDS
    process.env.MOTOR_TICK_DT_SECONDS = '1'
  })
  afterAll(() => {
    if (prevDt === undefined) delete process.env.MOTOR_TICK_DT_SECONDS
    else process.env.MOTOR_TICK_DT_SECONDS = prevDt
  })

  test('preço igual ao FV retorna delta zero', () => {
    const result = l2.applyLayer(baseState({ currentPrice: 100, fairValue: 100 }), params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('preço acima do FV gera delta negativo (correção para baixo)', () => {
    const result = l2.applyLayer(baseState({ currentPrice: 110, fairValue: 100 }), params(), 0)
    expect(result.deltaPrice).toBeLessThan(0)
  })

  test('preço abaixo do FV gera delta positivo (correção para cima)', () => {
    const result = l2.applyLayer(baseState({ currentPrice: 90, fairValue: 100 }), params(), 0)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('cap de 0.3%/tick: desvio grande é limitado', () => {
    // Desvio enorme: P=50, FV=100. theta=0.12, raw = 0.12*(100-50)*1 = 6 >> 0.3%*50=0.15
    const result = l2.applyLayer(
      baseState({ currentPrice: 50, fairValue: 100 }),
      params(),
      0
    )
    const maxAllowed = 50 * 0.003  // 0.3% de 50 = 0.15
    expect(result.deltaPrice).toBeLessThanOrEqual(maxAllowed + 1e-10)
    expect(result.metadata?.capped).toBe(1)
  })

  test('desvio pequeno não é cappado', () => {
    // Desvio pequeno: P=100, FV=100.1. theta=0.12, raw = 0.12*(0.1)*1 = 0.012 << 0.3%
    const result = l2.applyLayer(
      baseState({ currentPrice: 100, fairValue: 100.1 }),
      params(),
      0
    )
    expect(result.metadata?.capped).toBe(0)
  })

  test('FV zero usa closePrice como fallback', () => {
    const state = baseState({ fairValue: 0, closePrice: 95, currentPrice: 100 })
    const result = l2.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBeLessThan(0)  // P > closePrice → pull para baixo
  })

  test('currentPrice zero retorna delta zero', () => {
    const state = baseState({ currentPrice: 0 })
    const result = l2.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('layer name é L2_FundamentalAnchor', () => {
    const result = l2.applyLayer(baseState(), params(), 0)
    expect(result.layer).toBe('L2_FundamentalAnchor')
  })

  test('metadata contém theta, fairValue, cappedAt', () => {
    const result = l2.applyLayer(baseState({ fairValue: 105 }), params(), 0)
    expect(result.metadata).toMatchObject({
      theta: expect.any(Number),
      fairValue: 105,
      cappedAt: 0.003,
    })
  })
})
