/**
 * @jest-environment node
 */
// ============================================================================
// Freio de aproximação da banda do CB (PriceCalculator._applyApproachBrake).
//
// Garante que a "meta diária" segura o preço abaixo do threshold de 8% do
// circuit breaker sem derrubar os ativos: deltas que afastam o preço da âncora
// são freados perto da banda; movimentos de volta ao centro e notícias passam.
// ============================================================================

import { PriceCalculator } from '../PriceCalculator'
import type { AssetState, ClusterParams } from '../../types/motor.types'

const stateAt = (currentPrice: number, closePrice = 100): AssetState => ({
  id: 'a', ticker: 'TST', cluster: 'A_TOP', state: 'SP',
  currentPrice, openPrice: closePrice, highPrice: currentPrice, lowPrice: currentPrice,
  closePrice, fairValue: closePrice, volume: 0, variance: 0.0001,
  pendingBuyVolume: 0, pendingSellVolume: 0, isPaused: false, haltReason: null,
  haltResumeAt: null, newsImpact: 0, newsImpactTicks: 0, ofiState: 0,
  dailyVolAccum: 0, dailySigmaMultiplier: 1.0, volatilityMultiplier: 1.0,
})

// acesso ao método privado para teste determinístico
const brake = (calc: PriceCalculator, delta: number, state: AssetState, params?: ClusterParams): number =>
  (calc as unknown as { _applyApproachBrake(d: number, s: AssetState, p?: ClusterParams): number })._applyApproachBrake(delta, state, params)

describe('Freio de aproximação da banda do circuit breaker', () => {
  const calc = new PriceCalculator(undefined)

  test('sem freio longe da banda (net < 5%)', () => {
    expect(brake(calc, +1, stateAt(102))).toBeCloseTo(1, 6) // net 2%
  })

  test('freio parcial a 6% para movimento que afasta (fator 0.5)', () => {
    // net = 6%; banda 5%->7% => fator linear = 0.5
    expect(brake(calc, +1, stateAt(106))).toBeCloseTo(0.5, 6)
  })

  test('freio total a partir de 7% para movimento que afasta', () => {
    expect(brake(calc, +1, stateAt(107.5))).toBe(0) // net 7.5% >= 7%
    expect(brake(calc, +1, stateAt(107))).toBe(0)   // net 7% (limite)
  })

  test('movimento de VOLTA ao centro nunca é freado', () => {
    // net 6% acima, delta negativo (reduz afastamento) -> passa intacto
    expect(brake(calc, -1, stateAt(106))).toBeCloseTo(-1, 6)
    // simétrico abaixo da âncora: net -6%, delta positivo (volta) -> intacto
    expect(brake(calc, +1, stateAt(94))).toBeCloseTo(1, 6)
  })

  test('lado negativo da banda também é freado para fora', () => {
    // net -6%, delta negativo (afasta para baixo) -> fator 0.5
    expect(brake(calc, -1, stateAt(94))).toBeCloseTo(-0.5, 6)
  })

  test('notícia ativa fica isenta do freio (threshold de 20% no L10)', () => {
    const s = stateAt(106)
    s.newsImpact = 5
    s.newsImpactTicks = 10
    expect(brake(calc, +1, s)).toBeCloseTo(1, 6)
  })

  test('circuitBreakerEnabled=false remove o freio de aproximacao', () => {
    const s = stateAt(107.5)
    expect(brake(calc, +1, s)).toBe(0)
    expect(brake(calc, +1, s, { circuitBreakerEnabled: false } as ClusterParams)).toBe(1)
  })

  test('circuitBreakerThreshold vem do mesmo halt_trigger efetivo da SSoT', () => {
    const s = stateAt(112)
    const params = { circuitBreakerThreshold: 0.16 } as ClusterParams
    // Com threshold 16%, o freio comeca em 10% e zera em 14%; a 12% fica parcial.
    expect(brake(calc, +1, s, params)).toBeCloseTo(0.5, 6)
  })

  test('aplicações repetidas para fora nunca cruzam os 8% (assintota < banda)', () => {
    const s = stateAt(100)
    // empurra +0.8 por tick repetidamente (sem outras camadas)
    for (let i = 0; i < 200; i++) {
      const d = brake(calc, +0.8, s)
      s.currentPrice += d
    }
    const net = (s.currentPrice - s.closePrice) / s.closePrice
    expect(net).toBeLessThan(0.08) // nunca atinge o CB de 8%
    expect(net).toBeGreaterThan(0.06) // mas chega perto da banda (mercado vivo)
  })
})
