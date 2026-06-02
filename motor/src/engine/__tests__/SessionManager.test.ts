/**
 * @jest-environment node
 */
// ============================================================================
// SessionManager — Testes Unitários
// Cobre: limites de sessão BRT, horário de verão (DST), volatilidade,
//        próxima transição, isMarketOpen.
// ============================================================================

import { SessionManager } from '../SessionManager'
import type { SessionType } from '../../types/motor.types'

// ─── Helper: cria Date UTC para um horário BRT de inverno (UTC-3) ─────────
function brtWinter(hour: number, minute = 0): Date {
  // Horário de inverno Brasil: UTC-3 → para obter HH:MM BRT, subtrair 3h do UTC
  // Usar 2026-07-15 (julho = inverno no Brasil, sem DST)
  const utcHour = (hour + 3) % 24
  const dateStr = `2026-07-15T${String(utcHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`
  return new Date(dateStr)
}

// ─── Helper: cria Date UTC para um horário BRT sem DST ───────────
function brtNoDst(utcIso: string): Date {
  return new Date(utcIso)
}

// FootStock schedule (BRT):
//   CLOSED:       01:30 – 10:45
//   PRE_OPENING:  10:45 – 11:00
//   TRADING:      11:00 – 00:45 (next day)
//   CLOSING_CALL: 00:45 – 01:00
//   AFTER_MARKET: 01:00 – 01:30

describe('SessionManager', () => {
  describe('getCurrentSession — limites de horário (inverno UTC-3)', () => {
    test.each<[number, number, SessionType]>([
      [1, 29, 'AFTER_MARKET'],
      [1, 30, 'CLOSED'],
      [10, 44, 'CLOSED'],
      [10, 45, 'PRE_OPENING'],
      [10, 59, 'PRE_OPENING'],
      [11, 0, 'TRADING'],
      [16, 0, 'TRADING'],
      [23, 59, 'TRADING'],
      [0, 44, 'TRADING'],
      [0, 45, 'CLOSING_CALL'],
      [0, 59, 'CLOSING_CALL'],
      [1, 0, 'AFTER_MARKET'],
    ])('%02d:%02d BRT → %s', (hour, minute, expected) => {
      const sm = new SessionManager(() => brtWinter(hour, minute))
      expect(sm.getCurrentSession()).toBe(expected)
    })
  })

  describe('getCurrentSession — sem DST (Brasil eliminou horário de verão em 2019)', () => {
    // O Brasil eliminou o horário de verão pelo Decreto 9.528/2018.
    // A partir de 2019, America/Sao_Paulo é sempre UTC-3 (sem DST).

    test('15 Nov 2026 14:00 UTC = 11:00 BRT (UTC-3, sem DST) → TRADING', () => {
      // 14:00 UTC - 3h = 11:00 BRT → início de TRADING
      const sm = new SessionManager(() => brtNoDst('2026-11-15T14:00:00.000Z'))
      expect(sm.getCurrentSession()).toBe('TRADING')
    })

    test('15 Nov 2026 03:45 UTC = 00:45 BRT (UTC-3, sem DST) → CLOSING_CALL', () => {
      // 03:45 UTC - 3h = 00:45 BRT → início de CLOSING_CALL
      const sm = new SessionManager(() => brtNoDst('2026-11-15T03:45:00.000Z'))
      expect(sm.getCurrentSession()).toBe('CLOSING_CALL')
    })

    test('15 Nov 2026 13:45 UTC = 10:45 BRT (UTC-3, sem DST) → PRE_OPENING', () => {
      // 13:45 UTC - 3h = 10:45 BRT → início de PRE_OPENING
      // Confirma que date-fns-tz NÃO aplica offset UTC-2 (sem DST)
      const sm = new SessionManager(() => brtNoDst('2026-11-15T13:45:00.000Z'))
      expect(sm.getCurrentSession()).toBe('PRE_OPENING')
    })
  })

  describe('getVolatilityMultiplier', () => {
    const sm = new SessionManager(() => brtWinter(14, 0)) // 14:00 = TRADING

    test('TRADING → 1.0', () => {
      expect(sm.getVolatilityMultiplier('TRADING')).toBe(1.0)
    })

    test('CLOSED → 0.0', () => {
      expect(sm.getVolatilityMultiplier('CLOSED')).toBe(0.0)
    })

    test('PRE_OPENING → 0.30', () => {
      expect(sm.getVolatilityMultiplier('PRE_OPENING')).toBe(0.30)
    })

    test('CLOSING_CALL → 0.20', () => {
      expect(sm.getVolatilityMultiplier('CLOSING_CALL')).toBe(0.20)
    })

    test('AFTER_MARKET → 0.10', () => {
      expect(sm.getVolatilityMultiplier('AFTER_MARKET')).toBe(0.10)
    })

    test('sem parâmetro usa sessão atual', () => {
      const result = sm.getVolatilityMultiplier()
      expect(typeof result).toBe('number')
      expect(result).toBeGreaterThanOrEqual(0)
    })
  })

  describe('getNextTransition', () => {
    test('dentro de TRADING → próxima sessão é CLOSING_CALL', () => {
      const sm = new SessionManager(() => brtWinter(14, 0)) // 14:00 BRT = TRADING
      const { session, countdownSeconds } = sm.getNextTransition()
      expect(session).toBe('CLOSING_CALL')
      expect(countdownSeconds).toBeGreaterThan(0)
    })

    test('dentro de PRE_OPENING → próxima sessão é TRADING', () => {
      const sm = new SessionManager(() => brtWinter(10, 50)) // 10:50 BRT = PRE_OPENING
      const { session } = sm.getNextTransition()
      expect(session).toBe('TRADING')
    })

    test('countdownSeconds é positivo', () => {
      const sm = new SessionManager(() => brtWinter(10, 0))
      const { countdownSeconds } = sm.getNextTransition()
      expect(countdownSeconds).toBeGreaterThan(0)
    })
  })

  describe('isMarketOpen', () => {
    test('TRADING → true', () => {
      const sm = new SessionManager(() => brtWinter(14, 0))
      expect(sm.isMarketOpen()).toBe(true)
    })

    test('PRE_OPENING → true', () => {
      const sm = new SessionManager(() => brtWinter(10, 50))
      expect(sm.isMarketOpen()).toBe(true)
    })

    test('CLOSING_CALL → true', () => {
      const sm = new SessionManager(() => brtWinter(0, 50))
      expect(sm.isMarketOpen()).toBe(true)
    })

    test('CLOSED → false', () => {
      const sm = new SessionManager(() => brtWinter(5, 0))
      expect(sm.isMarketOpen()).toBe(false)
    })

    test('AFTER_MARKET → false', () => {
      const sm = new SessionManager(() => brtWinter(1, 15))
      expect(sm.isMarketOpen()).toBe(false)
    })
  })

  describe('injeção de clock', () => {
    test('aceita clock customizado para testes determinísticos', () => {
      const fixedTime = brtWinter(11, 0) // exatamente 11:00 → TRADING (inclusivo)
      const sm = new SessionManager(() => fixedTime)
      expect(sm.getCurrentSession()).toBe('TRADING')
    })
  })
})
