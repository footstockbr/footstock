/**
 * @jest-environment node
 */
import { L5_KyleLambda } from '../../layers/L5_KyleLambda'
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
  volatilityMultiplier: 1.0,
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
  alphaOfi: 0.0005,
  ...overrides,
})

describe('L5_KyleLambda', () => {
  const l5 = new L5_KyleLambda()

  test('volume zero retorna delta zero', () => {
    const state = baseState({ pendingBuyVolume: 0, pendingSellVolume: 0 })
    const result = l5.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('compras dominantes geram delta positivo', () => {
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const result = l5.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBeGreaterThan(0)
  })

  test('vendas dominantes geram delta negativo', () => {
    const state = baseState({ pendingBuyVolume: 0, pendingSellVolume: 1000 })
    const result = l5.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBeLessThan(0)
  })

  test('assimetria: compras sobem mais que vendas baixam (mesma magnitude)', () => {
    const buyState  = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const sellState = baseState({ pendingBuyVolume: 0, pendingSellVolume: 1000 })

    const buyDelta  = l5.applyLayer(buyState, params(), 0).deltaPrice
    const sellDelta = l5.applyLayer(sellState, params(), 0).deltaPrice

    // Compra deve ter impacto maior em módulo (assimetria > 1.0)
    expect(Math.abs(buyDelta)).toBeGreaterThan(Math.abs(sellDelta))
  })

  test('lambda maior gera impacto maior', () => {
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const low  = l5.applyLayer(state, params({ lambdaKyle: 0.0001 }), 0)
    const high = l5.applyLayer(state, params({ lambdaKyle: 0.001 }), 0)
    expect(Math.abs(high.deltaPrice)).toBeGreaterThan(Math.abs(low.deltaPrice))
  })

  test('assimetria metadata presente', () => {
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const result = l5.applyLayer(state, params(), 0)
    expect(result.metadata?.asymmetry).toBeGreaterThan(1.0)
    expect(result.metadata?.isBuyDominant).toBe(1)
  })

  test('layer name é L5_KyleLambda', () => {
    const result = l5.applyLayer(baseState(), params(), 0)
    expect(result.layer).toBe('L5_KyleLambda')
  })
})

// ============================================================================
// T2.4 — L5 usa fluxo líquido (abs(buy-sell)) no lugar de buy+sell bruto.
// Aceite: book equilibrado (buy == sell) -> impacto médio dentro de ±0,05%/tick
// e impacto -> 0 sem execução direcional. Reversão: revert se reagir a buy+sell
// bruto ou gerar drift em book equilibrado.
// ============================================================================
describe('L5_KyleLambda — T2.4 fluxo líquido em book equilibrado', () => {
  const l5 = new L5_KyleLambda()
  const legacy = new L5_KyleLambda({ legacyBase: true })

  test('book equilibrado (buy == sell > 0) -> impacto exatamente 0', () => {
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 1000 })
    const result = l5.applyLayer(state, params(), 0)
    expect(result.deltaPrice).toBe(0)
  })

  test('book equilibrado -> impacto médio dentro de ±0,05%/tick em vários níveis de volume', () => {
    // Sem fluxo direcional, qualquer nível de volume equilibrado deve manter o
    // impacto colado em 0 (muito abaixo do teto de 0,05% do preço por tick).
    const limit = 0.0005 * 100 // 0,05% de currentPrice=100
    for (const vol of [0, 500, 1000, 5000, 25_000, 100_000]) {
      const state = baseState({ pendingBuyVolume: vol, pendingSellVolume: vol })
      const delta = l5.applyLayer(state, params(), 0).deltaPrice
      expect(Math.abs(delta)).toBeLessThan(limit)
      expect(delta).toBe(0)
    }
  })

  test('VERMELHO (legacyBase): book equilibrado reage ao volume bruto buy+sell', () => {
    // Reproduz o bug pré-fix: base = buy+sell -> impacto NÃO-nulo mesmo equilibrado.
    const state = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 1000 })
    const delta = legacy.applyLayer(state, params(), 0).deltaPrice
    expect(Math.abs(delta)).toBeGreaterThan(0)
  })

  test('fluxo líquido reage só ao desequilíbrio direcional (buy-sell)', () => {
    // Mesmo volume bruto (2000) mas desequilíbrios diferentes -> impactos diferentes;
    // o impacto é função de |buy - sell|, não de buy + sell.
    const balanced   = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 1000 }) // net 0
    const imbalanced = baseState({ pendingBuyVolume: 1500, pendingSellVolume: 500 })  // net 1000
    const dBal = l5.applyLayer(balanced, params(), 0).deltaPrice
    const dImb = l5.applyLayer(imbalanced, params(), 0).deltaPrice
    expect(dBal).toBe(0)
    expect(dImb).toBeGreaterThan(0)
  })

  test('assimetria reduzida (perto de 1.0, ainda > 1.0) — Kyle não reescrito', () => {
    const buyState = baseState({ pendingBuyVolume: 1000, pendingSellVolume: 0 })
    const asymmetry = l5.applyLayer(buyState, params(), 0).metadata?.asymmetry as number
    expect(asymmetry).toBeGreaterThan(1.0)
    expect(asymmetry).toBeLessThanOrEqual(1.03) // reduzida da banda legacy 1.05-1.08
  })
})
