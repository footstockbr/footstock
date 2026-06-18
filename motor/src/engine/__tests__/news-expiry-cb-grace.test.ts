// News-expiry CB grace (06-18): valida o decaimento gradual do threshold do circuit
// breaker apos a noticia expirar, em vez do snap instantaneo 20%->8% que halt-loopava
// ativos que terminaram a noticia em [8%,20%) do close.
import { L10_CircuitBreaker, NEWS_CB_GRACE_TICKS } from '../layers/L10_CircuitBreaker'
import type { AssetState, ClusterParams } from '../../types/motor.types'

function makeState(over: Partial<AssetState>): AssetState {
  return {
    id: 'a', ticker: 'TST', cluster: 'A_TOP', state: '',
    currentPrice: 100, openPrice: 100, highPrice: 100, lowPrice: 100,
    closePrice: 100, fairValue: 100, volume: 0, variance: 0.0001,
    pendingBuyVolume: 0, pendingSellVolume: 0, isPaused: false,
    haltReason: null, haltResumeAt: null, newsImpact: 0, newsImpactTicks: 0,
    ofiState: 0, dailyVolAccum: 0, dailySigmaMultiplier: 1, volatilityMultiplier: 1,
    ...over,
  } as AssetState
}

const params = { circuitBreakerThreshold: 0.08 } as ClusterParams
const cb = new L10_CircuitBreaker()

describe('L10 — news-expiry CB grace (decaimento pos-noticia)', () => {
  test('grace cheio: 12% do close NAO dispara (threshold decai de 20%, nao snap 8%)', () => {
    // RED antes do fix: sem grace, 12% >= 8% -> halt no instante da expiracao.
    const r = cb.checkTrigger(112, makeState({ closePrice: 100, newsCbGraceTicks: NEWS_CB_GRACE_TICKS }), params)
    expect(r.triggered).toBe(false)
  })

  test('sem grace: 12% do close DISPARA no threshold normal de 8%', () => {
    const r = cb.checkTrigger(112, makeState({ closePrice: 100, newsCbGraceTicks: 0 }), params)
    expect(r.triggered).toBe(true)
  })

  test('grace pela metade: threshold ~14%, 12% nao dispara, 15% dispara', () => {
    const half = Math.floor(NEWS_CB_GRACE_TICKS / 2)
    expect(cb.checkTrigger(112, makeState({ closePrice: 100, newsCbGraceTicks: half }), params).triggered).toBe(false)
    expect(cb.checkTrigger(115, makeState({ closePrice: 100, newsCbGraceTicks: half }), params).triggered).toBe(true)
  })

  test('grace nao mascara movimento alem da banda de noticia: 25% dispara mesmo no grace cheio', () => {
    const r = cb.checkTrigger(125, makeState({ closePrice: 100, newsCbGraceTicks: NEWS_CB_GRACE_TICKS }), params)
    expect(r.triggered).toBe(true)
  })

  test('noticia ATIVA mantem banda de 20% (comportamento preservado)', () => {
    const r = cb.checkTrigger(118, makeState({ closePrice: 100, newsImpact: 0.5, newsImpactTicks: 10 }), params)
    expect(r.triggered).toBe(false)
  })
})
