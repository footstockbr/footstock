/**
 * @jest-environment node
 */
// ============================================================================
// 11-16 — halt do CB causado por noticia re-ancora closePrice na retomada.
//
// Incidente 2026-11-16 (PEI3): noticia BULLISH levou o preco a +18,86% da ancora
// (dentro da banda de 20% da noticia). Ao expirar, a grace decaiu o threshold e o
// CB disparou. Como a retomada nao re-ancorava (T4.2), cada retomada re-disparava
// no tick seguinte: trava-destrava de 5 em 5 min ate o PRE_OPENING do dia seguinte.
//
// RED antes do fix: a retomada preservava a ancora 13.9336 e o CB re-disparava.
// GREEN depois: halt por noticia re-ancora; halt por ruido continua sem re-ancorar.
// ============================================================================

import { applyCbResumeAnchor, isNewsDrivenCbHalt } from '../MarketEngine'
import { L10_CircuitBreaker, NEWS_CB_GRACE_TICKS } from '../layers/L10_CircuitBreaker'
import type { AssetState, ClusterParams } from '../../types/motor.types'

function makeState(over: Partial<AssetState>): AssetState {
  return {
    id: 'a', ticker: 'PEI3', cluster: 'A_MID', state: '',
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

describe('isNewsDrivenCbHalt', () => {
  it('noticia ativa: halt e por noticia', () => {
    expect(isNewsDrivenCbHalt(makeState({ newsImpact: 0.6, newsImpactTicks: 12 }))).toBe(true)
  })

  it('noticia expirada mas na grace: halt e por noticia', () => {
    expect(isNewsDrivenCbHalt(makeState({ newsCbGraceTicks: 40 }))).toBe(true)
  })

  it('sem noticia e sem grace: halt por ruido', () => {
    expect(isNewsDrivenCbHalt(makeState({}))).toBe(false)
    expect(isNewsDrivenCbHalt(makeState({ newsCbGraceTicks: 0 }))).toBe(false)
  })

  it('magnitude zerada com ticks residuais nao conta como noticia ativa (mesma regra do L10)', () => {
    expect(isNewsDrivenCbHalt(makeState({ newsImpact: 0, newsImpactTicks: 5 }))).toBe(false)
  })
})

describe('applyCbResumeAnchor — incidente PEI3 (halt na grace pos-noticia)', () => {
  // Valores reais de 2026-11-16: ancora 13.9336, preco 16.56 (+18,86%).
  const haltedOnGrace = () => makeState({
    closePrice: 13.9336,
    currentPrice: 16.56,
    newsCbGraceTicks: NEWS_CB_GRACE_TICKS - 7,
    cbHaltNewsDriven: true,
  })

  it('pre-condicao: o CB dispara com a grace em andamento (threshold ja abaixo de 18,86%)', () => {
    const s = haltedOnGrace()
    s.cbHaltNewsDriven = undefined
    expect(cb.checkTrigger(s.currentPrice, s, params).triggered).toBe(true)
  })

  it('retomada re-ancora ao preco corrente e o CB NAO re-dispara (fim do trava-destrava)', () => {
    const s = haltedOnGrace()
    const r = applyCbResumeAnchor(s)
    expect(r).toEqual({ reanchored: true, previousClose: 13.9336 })
    expect(s.closePrice).toBe(16.56)
    expect(s.cbHaltNewsDriven).toBe(false)
    expect(cb.checkTrigger(s.currentPrice * 1.01, s, params).triggered).toBe(false)
  })

  it('noticia absorvida: grace zerada, banda volta a ser 8% a partir da ancora nova', () => {
    const s = haltedOnGrace()
    applyCbResumeAnchor(s)
    expect(s.newsCbGraceTicks).toBe(0)
    expect(cb.checkTrigger(16.56 * 1.07, s, params).triggered).toBe(false)
    expect(cb.checkTrigger(16.56 * 1.09, s, params).triggered).toBe(true)
  })

  it('so UMA re-ancora por noticia: o halt seguinte (sem grace) e por ruido e preserva a ancora', () => {
    const s = haltedOnGrace()
    applyCbResumeAnchor(s)
    s.currentPrice = 16.56 * 1.085
    s.cbHaltNewsDriven = isNewsDrivenCbHalt(s)
    expect(s.cbHaltNewsDriven).toBe(false)
    const r = applyCbResumeAnchor(s)
    expect(r.reanchored).toBe(false)
    expect(s.closePrice).toBe(16.56)
  })
})

describe('applyCbResumeAnchor — demais casos', () => {
  it('halt por ruido (T4.2): ancora do dia preservada, sem catraca', () => {
    const s = makeState({ closePrice: 100, currentPrice: 107.9, cbHaltNewsDriven: false })
    expect(applyCbResumeAnchor(s)).toEqual({ reanchored: false, previousClose: 100 })
    expect(s.closePrice).toBe(100)
    expect(cb.checkTrigger(107.9 * 1.05, s, params).triggered).toBe(true)
  })

  it('marca ausente (halt reidratado no boot): comportamento T4.2', () => {
    const s = makeState({ closePrice: 100, currentPrice: 107.9 })
    expect(applyCbResumeAnchor(s).reanchored).toBe(false)
    expect(s.closePrice).toBe(100)
  })

  it('halt com noticia ainda ativa: re-ancora mas NAO mexe na grace (sera renovada na expiracao)', () => {
    const s = makeState({
      closePrice: 100, currentPrice: 121, newsImpact: 0.8, newsImpactTicks: 15,
      newsCbGraceTicks: 0, cbHaltNewsDriven: true,
    })
    expect(applyCbResumeAnchor(s).reanchored).toBe(true)
    expect(s.closePrice).toBe(121)
    expect(s.newsImpactTicks).toBe(15)
  })

  it('preco corrente invalido: nunca grava ancora nula, preserva a anterior', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = makeState({ closePrice: 100, currentPrice: bad, newsCbGraceTicks: 30, cbHaltNewsDriven: true })
      expect(applyCbResumeAnchor(s).reanchored).toBe(false)
      expect(s.closePrice).toBe(100)
      expect(s.cbHaltNewsDriven).toBe(false)
    }
  })
})
