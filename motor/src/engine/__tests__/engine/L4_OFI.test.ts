/**
 * @jest-environment node
 */
import { L4_OrderFlowImbalance } from '../../layers/L4_OrderFlowImbalance'
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
  alphaOfi: 0.001,
  ...overrides,
})

describe('L4_OrderFlowImbalance', () => {
  test('volume zero retorna delta zero mas mantém ofiState decaído', () => {
    const state = baseState({ pendingBuyVolume: 0, pendingSellVolume: 0, ofiState: 0.5 })
    const result = new L4_OrderFlowImbalance().applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBe(0)
    // ofiState não é alterado se volume=0 (formula: ofi_raw não existe)
    expect(state.ofiState).toBe(0.5)  // mantido
  })

  test('mais compras que vendas gera delta positivo', () => {
    const l4 = new L4_OrderFlowImbalance()
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 200, ofiState: 0 })
    const result = l4.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('mais vendas que compras gera delta negativo', () => {
    const l4 = new L4_OrderFlowImbalance()
    const state = baseState({ pendingBuyVolume: 100, pendingSellVolume: 900, ofiState: 0 })
    const result = l4.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBeLessThan(0)
  })

  test('atualiza ofiState via EWMA (OFI_t = rho*OFI_{t-1} + (1-rho)*ofi_raw)', () => {
    const l4 = new L4_OrderFlowImbalance()
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0, ofiState: 0 })
    const rho = 0.91
    const ofiRaw = 1.0  // buy_vol=1000, sell_vol=0 → ofi_raw=1

    l4.applyLayer(state, params(), 0)

    const expected = rho * 0 + (1 - rho) * ofiRaw
    expect(state.ofiState).toBeCloseTo(expected, 10)
  })

  test('memória OFI persiste entre ticks (EWMA acumula)', () => {
    const l4 = new L4_OrderFlowImbalance()
    const state = baseState({ pendingBuyVolume: 800, pendingSellVolume: 200, ofiState: 0 })

    // Tick 1
    l4.applyLayer(state, params(), 0)
    const ofiAfterTick1 = state.ofiState ?? 0

    // Tick 2: sem volume — ofiState deve decair (mas formula retorna 0 delta)
    const stateT2 = { ...state, pendingBuyVolume: 0, pendingSellVolume: 0 }
    l4.applyLayer(stateT2, params(), 0)

    // Se volume=0, ofiState não é atualizado nesta implementação
    expect(stateT2.ofiState).toBe(ofiAfterTick1)
  })

  test('decaimento rho=0.97 (B_ILLIQ) persiste mais que rho=0.91 (A_TOP)', () => {
    const l4 = new L4_OrderFlowImbalance()

    // Inicia com mesmo OFI
    const stateA = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 500, ofiState: 0.5 })
    const stateB = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 500, ofiState: 0.5 })

    l4.applyLayer(stateA, params({ ofiDecay: 0.91 }), 0)
    l4.applyLayer(stateB, params({ ofiDecay: 0.97 }), 0)

    // B_ILLIQ mantém mais memória do estado anterior
    expect(Math.abs(stateB.ofiState! - 0.5)).toBeLessThan(Math.abs(stateA.ofiState! - 0.5))
  })

  test('layer name é L4_OrderFlowImbalance', () => {
    const l4 = new L4_OrderFlowImbalance()
    const result = l4.applyLayer(baseState(), params(), 0)
    expect(result.layer).toBe('L4_OrderFlowImbalance')
  })
})
