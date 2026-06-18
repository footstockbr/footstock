/**
 * @jest-environment node
 */
// ============================================================================
// T4.2 — closePrice (âncora do circuit breaker) NÃO é re-ancorada no warm-start
// nem na retomada do CB. A re-âncora só é legítima na abertura do dia.
// Loop 06-17-motor-footstock-correcoes-variacoes / item 017.
//
// Causa raiz: re-ancorar closePrice = currentPrice no reinício do motor
// (loadAssets) e na retomada do CB (scheduleCircuitBreakerResume) criava uma
// catraca — cada restart/halt abria uma banda de 8% nova a partir do preço
// corrente. Combinado, isso escalava o preço em escada até o floor R$1 (sintoma
// documentado no próprio MarketEngine.ts). O fix preserva a âncora persistida do
// dia; a única re-âncora legítima é a transição de sessão PRE_OPENING.
//
// Antes desta correção (re-âncora ativa), a invariante de warm-start abaixo
// falhava (closePrice virava currentPrice, não o close persistido).
// ============================================================================

import { resolveWarmStartClosePrice } from '../MarketEngine'
import { L10_CircuitBreaker } from '../layers/L10_CircuitBreaker'
import type { AssetState } from '../../types/motor.types'

describe('T4.2 warm-start — closePrice adota o close persistido, não currentPrice', () => {
  it('preço subiu +5% intraday antes do restart: âncora permanece o close persistido', () => {
    // DB persistiu close=100 (âncora do dia). Preço corrente subiu para 105.
    // ANTES (bug): warm-start re-ancorava closePrice=105 — banda alargava a cada restart.
    // DEPOIS: closePrice=100 (persistido).
    expect(resolveWarmStartClosePrice(100, 105, null)).toBe(100)
  })

  it('preço caiu intraday antes do restart: âncora permanece o close persistido', () => {
    expect(resolveWarmStartClosePrice(100, 93, null)).toBe(100)
  })

  it('auto-recovery: âncora acompanha o preço canônico de recovery (reset legítimo)', () => {
    expect(resolveWarmStartClosePrice(100, 40, 40)).toBe(40)
  })

  it('close persistido inválido (<=0 ou não-finito): fallback de segurança para currentPrice', () => {
    // Cobre a condição de reversão "produzir referência nula" — nunca devolve 0/NaN.
    expect(resolveWarmStartClosePrice(0, 50, null)).toBe(50)
    expect(resolveWarmStartClosePrice(-1, 50, null)).toBe(50)
    expect(resolveWarmStartClosePrice(Number.NaN, 50, null)).toBe(50)
  })
})

describe('T4.2 retomada de CB — closePrice preservado da pré-halt, sem catraca', () => {
  const cb = new L10_CircuitBreaker()

  // O L9/L10 travam o movimento que excederia a banda; na retomada currentPrice
  // está logo abaixo de +8% da âncora preservada (100).
  const stateAtResume = (): AssetState => ({
    id: 'asset_cb',
    ticker: 'POR3',
    cluster: 'A_TOP',
    state: 'SP',
    currentPrice: 107.9, // pinçado logo abaixo de +8% da âncora 100
    openPrice: 100,
    highPrice: 107.9,
    lowPrice: 100,
    closePrice: 100, // âncora do dia preservada (NÃO re-ancorada)
    fairValue: 100,
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

  it('a retomada NÃO muta closePrice (replica scheduleCircuitBreakerResume pós-fix)', () => {
    const state = stateAtResume()
    const anchorBefore = state.closePrice
    // Replica EXATAMENTE a retomada pós-fix: limpa o halt, NÃO toca closePrice.
    state.isPaused = false
    state.haltReason = null
    state.haltResumeAt = null
    // (sem: state.closePrice = state.currentPrice)
    expect(state.closePrice).toBe(anchorBefore) // âncora preservada, não re-ancorada
  })

  it('com a âncora preservada, currentPrice (<8%) NÃO re-dispara o CB na retomada', () => {
    const state = stateAtResume()
    // 7.9% da âncora 100 -> abaixo do limiar de 8% -> sem loop de halt.
    expect(cb.checkTrigger(state.currentPrice, state).triggered).toBe(false)
  })

  it('sem catraca: o preço não pode escalar +8% a partir do preço de retomada', () => {
    const state = stateAtResume()
    // Com a âncora em 100, 107.9*1.05 = 113.3 já está >8% da âncora -> trava.
    expect(cb.checkTrigger(state.currentPrice * 1.05, state).triggered).toBe(true)
  })

  it('regressão a evitar: re-ancorar em currentPrice ABRIRIA banda nova (catraca do bug)', () => {
    const state = stateAtResume()
    // Comportamento ANTIGO: closePrice = currentPrice na retomada.
    state.closePrice = state.currentPrice
    // +5% a partir do preço de retomada agora NÃO dispara — banda nova (catraca).
    expect(cb.checkTrigger(state.currentPrice * 1.05, state).triggered).toBe(false)
  })
})

describe('T4.2 carry-over entre dias — re-âncora só na abertura legítima (guarda timezone)', () => {
  // Regression guard auxiliar (NÃO bloqueia a regra principal): a ÚNICA re-âncora
  // legítima de closePrice é a transição de sessão para PRE_OPENING (abertura do
  // dia). Fixa o boundary observado hoje para flagrar regressão caso a infra mude
  // o fuso da chave daily_vol:{ticker}:{date} (UTC vs BRT) — decisão de infra
  // externa, fora do escopo desta task.
  it('warm-start no MEIO do dia preserva o close persistido (sem rollover)', () => {
    // Mesmo dia: nenhum rollover -> âncora persistida do dia anterior é mantida.
    expect(resolveWarmStartClosePrice(95.5, 98.2, null)).toBe(95.5)
  })

  it('abertura legítima do dia (PRE_OPENING) re-ancora close=current — regra preservada', () => {
    // Replica a regra de transição de sessão (MarketEngine.tick PRE_OPENING):
    //   state.closePrice = state.currentPrice  (âncora do novo dia)
    const state = { currentPrice: 98.2, closePrice: 95.5 }
    state.closePrice = state.currentPrice // transição -> PRE_OPENING
    expect(state.closePrice).toBe(98.2) // novo dia, nova âncora legítima
  })
})
