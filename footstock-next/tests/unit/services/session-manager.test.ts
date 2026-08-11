/**
 * @jest-environment node
 *
 * SessionManager do Next — espelho da logica do motor Railway.
 * Foco: a proxima transicao (o "Fecha em ..." do badge de sessao) tem que
 * apontar para o FECHAMENTO durante o pregao, nao para a abertura seguinte.
 */
import {
  getCurrentSession,
  getNextTransition,
  isMarketOpen,
  formatCountdown,
} from '@/lib/services/session-manager'
import { MarketSession } from '@/lib/constants/market'

/** Constroi um instante a partir do relogio de Brasilia (GMT-3, sem DST). */
function brt(iso: string): Date {
  return new Date(`${iso}-03:00`)
}

describe('session-manager — sessao atual', () => {
  it.each([
    ['2026-08-11T09:00:00', MarketSession.CLOSED],
    ['2026-08-11T10:50:00', MarketSession.PRE_OPENING],
    ['2026-08-11T11:00:00', MarketSession.TRADING],
    ['2026-08-11T17:41:00', MarketSession.TRADING],
    ['2026-08-11T00:50:00', MarketSession.CLOSING_CALL],
    ['2026-08-11T01:10:00', MarketSession.AFTER_MARKET],
    ['2026-08-11T02:00:00', MarketSession.CLOSED],
  ])('%s BRT -> %s', (iso, expected) => {
    expect(getCurrentSession(brt(iso))).toBe(expected)
  })
})

describe('session-manager — proxima transicao', () => {
  it('em pleno pregao aponta para o FECHAMENTO (00:45), nao para a abertura seguinte', () => {
    // Regressao: as 17:41 o badge dizia "Fecha em 17h 03min" (10:45 do dia
    // seguinte). O fechamento real e as 00:45 -> 7h 04min.
    const { session, countdownSeconds, transitionAt } = getNextTransition(brt('2026-08-11T17:41:00'))
    expect(session).toBe(MarketSession.CLOSING_CALL)
    expect(countdownSeconds).toBe(7 * 3600 + 4 * 60)
    expect(transitionAt).toBe('2026-08-12T03:45:00.000Z') // 00:45 BRT
    expect(formatCountdown(countdownSeconds)).toBe('7h 04min')
  })

  it('fora do pregao aponta para a abertura (pre-abertura 10:45)', () => {
    const { session, countdownSeconds } = getNextTransition(brt('2026-08-11T09:00:00'))
    expect(session).toBe(MarketSession.PRE_OPENING)
    expect(countdownSeconds).toBe(105 * 60)
  })

  it('na pre-abertura aponta para o inicio do pregao (11:00)', () => {
    const { session, countdownSeconds } = getNextTransition(brt('2026-08-11T10:50:00'))
    expect(session).toBe(MarketSession.TRADING)
    expect(countdownSeconds).toBe(10 * 60)
  })

  it('no closing call aponta para o after-market (01:00)', () => {
    const { session, countdownSeconds } = getNextTransition(brt('2026-08-11T00:50:00'))
    expect(session).toBe(MarketSession.AFTER_MARKET)
    expect(countdownSeconds).toBe(10 * 60)
  })

  it('transitionAt e um instante real — independe do fuso do processo', () => {
    const original = process.env.TZ
    try {
      process.env.TZ = 'UTC'
      const utc = getNextTransition(brt('2026-08-11T17:41:00'))
      process.env.TZ = 'America/Sao_Paulo'
      const sp = getNextTransition(brt('2026-08-11T17:41:00'))
      expect(utc.transitionAt).toBe(sp.transitionAt)
      expect(utc.countdownSeconds).toBe(sp.countdownSeconds)
    } finally {
      process.env.TZ = original
    }
  })
})

describe('session-manager — mercado aberto', () => {
  it.each([
    ['2026-08-11T17:41:00', true],
    ['2026-08-11T10:50:00', true],
    ['2026-08-11T00:50:00', true],
    ['2026-08-11T01:10:00', false],
    ['2026-08-11T09:00:00', false],
  ])('%s BRT -> %s', (iso, expected) => {
    expect(isMarketOpen(brt(iso))).toBe(expected)
  })
})
