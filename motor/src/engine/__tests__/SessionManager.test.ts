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

// ─── Helper: cria Date UTC para um horário BRT de verão (UTC-2) ───────────
function brtSummer(utcIso: string): Date {
  return new Date(utcIso)
}

describe('SessionManager', () => {
  describe('getCurrentSession — limites de horário (inverno UTC-3)', () => {
    test.each<[number, number, SessionType]>([
      [7, 59, 'FECHADO'],
      [8, 0, 'PRE_ABERTURA'],
      [9, 29, 'PRE_ABERTURA'],
      [9, 30, 'NEGOCIACAO'],
      [16, 59, 'NEGOCIACAO'],
      [17, 0, 'CALL'],
      [17, 29, 'CALL'],
      [17, 30, 'AFTER_MARKET'],
      [17, 59, 'AFTER_MARKET'],
      [18, 0, 'FECHADO'],
      [22, 0, 'FECHADO'],
      [0, 0, 'FECHADO'],
    ])('%02d:%02d BRT → %s', (hour, minute, expected) => {
      const sm = new SessionManager(() => brtWinter(hour, minute))
      expect(sm.getCurrentSession()).toBe(expected)
    })
  })

  describe('getCurrentSession — sem DST (Brasil eliminou horário de verão em 2019)', () => {
    // O Brasil eliminou o horário de verão pelo Decreto 9.528/2018.
    // A partir de 2019, America/Sao_Paulo é sempre UTC-3 (sem DST).
    // Os testes verificam que date-fns-tz usa a regra IANA correta (sem offset de +1h em novembro).

    test('15 Nov 2026 12:30 UTC = 09:30 BRT (UTC-3, sem DST) → NEGOCIACAO', () => {
      // 12:30 UTC - 3h = 09:30 BRT → início inclusivo de NEGOCIACAO
      const sm = new SessionManager(() => brtSummer('2026-11-15T12:30:00.000Z'))
      expect(sm.getCurrentSession()).toBe('NEGOCIACAO')
    })

    test('15 Nov 2026 20:00 UTC = 17:00 BRT (UTC-3, sem DST) → CALL', () => {
      // 20:00 UTC - 3h = 17:00 BRT → início de CALL (17:00-17:30)
      const sm = new SessionManager(() => brtSummer('2026-11-15T20:00:00.000Z'))
      expect(sm.getCurrentSession()).toBe('CALL')
    })

    test('15 Nov 2026 11:30 UTC = 08:30 BRT (UTC-3, sem DST) → PRE_ABERTURA', () => {
      // 11:30 UTC - 3h = 08:30 BRT → PRE_ABERTURA (08:00-09:30)
      // Confirma que date-fns-tz NÃO aplica offset UTC-2 (como seria se DST fosse ativo)
      const sm = new SessionManager(() => brtSummer('2026-11-15T11:30:00.000Z'))
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
      const sm = new SessionManager(() => brtWinter(8, 30)) // 08:30 BRT = PRE_ABERTURA
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
      const sm = new SessionManager(() => brtWinter(8, 30))
      expect(sm.isMarketOpen()).toBe(true)
    })

    test('FECHADO → false', () => {
      const sm = new SessionManager(() => brtWinter(22, 0))
      expect(sm.isMarketOpen()).toBe(false)
    })

    test('CALL → false', () => {
      const sm = new SessionManager(() => brtWinter(17, 15))
      expect(sm.isMarketOpen()).toBe(false)
    })

    test('AFTER_MARKET → false', () => {
      const sm = new SessionManager(() => brtWinter(17, 45))
      expect(sm.isMarketOpen()).toBe(false)
    })
  })

  describe('injeção de clock', () => {
    test('aceita clock customizado para testes determinísticos', () => {
      const fixedTime = brtWinter(9, 30) // exatamente 09:30 → NEGOCIACAO (inclusivo)
      const sm = new SessionManager(() => fixedTime)
      expect(sm.getCurrentSession()).toBe('NEGOCIACAO')
    })
  })
})
