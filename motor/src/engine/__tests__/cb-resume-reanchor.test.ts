/**
 * @jest-environment node
 */
// ============================================================================
// Regressão — Circuit Breaker NÃO entra em loop de halt após retomada.
//
// Causa raiz do incidente "maioria dos ativos presa em Pausado": ao retomar
// (scheduleCircuitBreakerResume em MarketEngine.ts), o motor re-ancorava o CB
// em openPrice — o mesmo valor congelado de onde o preço já havia se afastado
// >=8%. No tick seguinte, L10 comparava currentPrice (longe) vs closePrice
// (=openPrice congelado) e re-disparava o CB imediatamente, indefinidamente.
//
// Fix: re-ancorar closePrice = currentPrice na retomada (banda de 8% nova a
// partir do preço de retomada). Este teste valida a invariante na camada L10,
// que é onde o gatilho mora, sem precisar instanciar a engine completa.
// ============================================================================

import { L10_CircuitBreaker } from '../layers/L10_CircuitBreaker'
import type { AssetState, ClusterParams } from '../../types/motor.types'

const stateAfterDrift = (): AssetState => ({
  id: 'asset_cb',
  ticker: 'POR3',
  cluster: 'A_TOP',
  state: 'SP',
  // Preço derivou ~18% acima da âncora de abertura do dia e disparou o CB.
  currentPrice: 33.04,
  openPrice: 28.00,
  highPrice: 33.04,
  lowPrice: 28.00,
  closePrice: 28.00, // âncora no disparo
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

const noParams = {} as ClusterParams

describe('Circuit breaker — retomada sem loop de halt', () => {
  const cb = new L10_CircuitBreaker()

  test('âncora antiga (openPrice congelado) re-dispara o CB — reproduz o bug', () => {
    const state = stateAfterDrift()
    // Comportamento ANTIGO: closePrice = openPrice na retomada.
    state.closePrice = state.openPrice
    const r = cb.checkTrigger(state.currentPrice, state)
    expect(r.triggered).toBe(true) // 18% >= 8% => re-dispara imediatamente (loop)
  })

  test('re-ancorar em currentPrice na retomada NÃO re-dispara o CB (fix)', () => {
    const state = stateAfterDrift()
    // Comportamento NOVO: closePrice = currentPrice na retomada.
    state.closePrice = state.currentPrice
    const r = cb.checkTrigger(state.currentPrice, state)
    expect(r.triggered).toBe(false) // variação 0% => banda de 8% nova, sem loop
  })

  test('após re-ancorar, só dispara de novo com movimento >=8% a partir da retomada', () => {
    const state = stateAfterDrift()
    state.closePrice = state.currentPrice // retomada re-ancora

    // Movimento de +5% a partir da retomada: dentro da banda, não dispara.
    expect(cb.checkTrigger(state.currentPrice * 1.05, state).triggered).toBe(false)

    // Movimento de +8.5% a partir da retomada: ultrapassa a banda, dispara.
    expect(cb.checkTrigger(state.currentPrice * 1.085, state).triggered).toBe(true)
  })
})
