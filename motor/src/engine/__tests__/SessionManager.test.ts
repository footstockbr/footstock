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

// Foot Stock schedule (BRT):
//   FECHADO:      01:30 – 10:45
//   PRE_ABERTURA: 10:45 – 11:00
//   NEGOCIACAO:   11:00 – 00:45 (next day)
//   CALL:         00:45 – 01:00
//   AFTER_MARKET: 01:00 – 01:30

describe('SessionManager', () => {
  describe('getCurrentSession — limites de horário (inverno UTC-3)', () => {
    test.each<[number, number, SessionType]>([
      [1, 29, 'AFTER_MARKET'],
      [1, 30, 'FECHADO'],
      [10, 44, 'FECHADO'],
      [10, 45, 'PRE_ABERTURA'],
      [10, 59, 'PRE_ABERTURA'],
      [11, 0, 'NEGOCIACAO'],
      [16, 0, 'NEGOCIACAO'],
      [23, 59, 'NEGOCIACAO'],
      [0, 44, 'NEGOCIACAO'],
      [0, 45, 'CALL'],
      [0, 59, 'CALL'],
      [1, 0, 'AFTER_MARKET'],
    ])('%02d:%02d BRT → %s', (hour, minute, expected) => {
      const sm = new SessionManager(() => brtWinter(hour, minute))
      expect(sm.getCurrentSession()).toBe(expected)
    })
  })

  describe('getCurrentSession — sem DST (Brasil eliminou horário de verão em 2019)', () => {
    // O Brasil eliminou o horário de verão pelo Decreto 9.528/2018.
    // A partir de 2019, America/Sao_Paulo é sempre UTC-3 (sem DST).

    test('15 Nov 2026 14:00 UTC = 11:00 BRT (UTC-3, sem DST) → NEGOCIACAO', () => {
      // 14:00 UTC - 3h = 11:00 BRT → início de NEGOCIACAO
      const sm = new SessionManager(() => brtNoDst('2026-11-15T14:00:00.000Z'))
      expect(sm.getCurrentSession()).toBe('NEGOCIACAO')
    })

    test('15 Nov 2026 03:45 UTC = 00:45 BRT (UTC-3, sem DST) → CALL', () => {
      // 03:45 UTC - 3h = 00:45 BRT → início de CALL
      const sm = new SessionManager(() => brtNoDst('2026-11-15T03:45:00.000Z'))
      expect(sm.getCurrentSession()).toBe('CALL')
    })

    test('15 Nov 2026 13:45 UTC = 10:45 BRT (UTC-3, sem DST) → PRE_ABERTURA', () => {
      // 13:45 UTC - 3h = 10:45 BRT → início de PRE_ABERTURA
      // Confirma que date-fns-tz NÃO aplica offset UTC-2 (sem DST)
      const sm = new SessionManager(() => brtNoDst('2026-11-15T13:45:00.000Z'))
      expect(sm.getCurrentSession()).toBe('PRE_ABERTURA')
    })
  })

  describe('getVolatilityMultiplier', () => {
    const sm = new SessionManager(() => brtWinter(14, 0)) // 14:00 = NEGOCIACAO

    test('NEGOCIACAO → 1.0', () => {
      expect(sm.getVolatilityMultiplier('NEGOCIACAO')).toBe(1.0)
    })

    test('FECHADO → 0.0', () => {
      expect(sm.getVolatilityMultiplier('FECHADO')).toBe(0.0)
    })

    test('PRE_ABERTURA → 0.30', () => {
      expect(sm.getVolatilityMultiplier('PRE_ABERTURA')).toBe(0.30)
    })

    test('CALL → 0.20', () => {
      expect(sm.getVolatilityMultiplier('CALL')).toBe(0.20)
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
    test('dentro de NEGOCIACAO → próxima sessão é CALL', () => {
      const sm = new SessionManager(() => brtWinter(14, 0)) // 14:00 BRT = NEGOCIACAO
      const { session, countdownSeconds } = sm.getNextTransition()
      expect(session).toBe('CALL')
      expect(countdownSeconds).toBeGreaterThan(0)
    })

    test('dentro de PRE_ABERTURA → próxima sessão é NEGOCIACAO', () => {
      const sm = new SessionManager(() => brtWinter(10, 50)) // 10:50 BRT = PRE_ABERTURA
      const { session } = sm.getNextTransition()
      expect(session).toBe('NEGOCIACAO')
    })

    test('countdownSeconds é positivo', () => {
      const sm = new SessionManager(() => brtWinter(10, 0))
      const { countdownSeconds } = sm.getNextTransition()
      expect(countdownSeconds).toBeGreaterThan(0)
    })
  })

  describe('isMarketOpen', () => {
    test('NEGOCIACAO → true', () => {
      const sm = new SessionManager(() => brtWinter(14, 0))
      expect(sm.isMarketOpen()).toBe(true)
    })

    test('PRE_ABERTURA → true', () => {
      const sm = new SessionManager(() => brtWinter(10, 50))
      expect(sm.isMarketOpen()).toBe(true)
    })

    test('FECHADO → false', () => {
      const sm = new SessionManager(() => brtWinter(5, 0))
      expect(sm.isMarketOpen()).toBe(false)
    })

    test('CALL → false', () => {
      const sm = new SessionManager(() => brtWinter(0, 50))
      expect(sm.isMarketOpen()).toBe(false)
    })

    test('AFTER_MARKET → false', () => {
      const sm = new SessionManager(() => brtWinter(1, 15))
      expect(sm.isMarketOpen()).toBe(false)
    })
  })

  describe('injeção de clock', () => {
    test('aceita clock customizado para testes determinísticos', () => {
      const fixedTime = brtWinter(11, 0) // exatamente 11:00 → NEGOCIACAO (inclusivo)
      const sm = new SessionManager(() => fixedTime)
      expect(sm.getCurrentSession()).toBe('NEGOCIACAO')
    })
  })
})
