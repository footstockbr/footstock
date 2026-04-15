/**
 * Testes unitários — src/utils/timezone.ts
 * Verifica cálculos de fuso horário BRT (UTC-3) para limites diários de ordens.
 * T-020 / INT-019
 */

import {
  todayInBRT,
  getBrtDayBounds,
  secondsUntilMidnightBRT,
  nextMidnightBRT,
  formatTimeUntilReset,
} from '@/utils/timezone'

// UTC-3 offset em ms
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000

describe('timezone utilities', () => {
  describe('todayInBRT', () => {
    it('retorna a data correta no fuso BRT quando está antes da meia-noite UTC', () => {
      // 2026-04-14T02:30:00Z = 2026-04-13T23:30:00 BRT
      const now = new Date('2026-04-14T02:30:00.000Z')
      expect(todayInBRT(now)).toBe('2026-04-13')
    })

    it('retorna a data correta no fuso BRT quando está após a meia-noite UTC', () => {
      // 2026-04-14T04:00:00Z = 2026-04-14T01:00:00 BRT
      const now = new Date('2026-04-14T04:00:00.000Z')
      expect(todayInBRT(now)).toBe('2026-04-14')
    })

    it('retorna a data correta exatamente na meia-noite BRT (03:00 UTC)', () => {
      // 2026-04-14T03:00:00Z = 2026-04-14T00:00:00 BRT
      const now = new Date('2026-04-14T03:00:00.000Z')
      expect(todayInBRT(now)).toBe('2026-04-14')
    })

    it('retorna a data correta exatamente 1 segundo antes da meia-noite BRT', () => {
      // 2026-04-14T02:59:59Z = 2026-04-13T23:59:59 BRT
      const now = new Date('2026-04-14T02:59:59.000Z')
      expect(todayInBRT(now)).toBe('2026-04-13')
    })

    it('não usa a data UTC quando há diferença de fuso', () => {
      // Às 01:00 UTC = 22:00 BRT do dia anterior
      const now = new Date('2026-04-14T01:00:00.000Z')
      const brtDate = todayInBRT(now)
      const utcDate = now.toISOString().slice(0, 10)
      expect(brtDate).toBe('2026-04-13')
      expect(brtDate).not.toBe(utcDate) // BRT ≠ UTC neste caso
    })
  })

  describe('getBrtDayBounds', () => {
    it('retorna startUtc e endUtc corretos para um dia BRT', () => {
      // 2026-04-14T10:00:00Z = 2026-04-14T07:00:00 BRT
      const now = new Date('2026-04-14T10:00:00.000Z')
      const { startUtc, endUtc } = getBrtDayBounds(now)

      // Meia-noite BRT do dia 14 = 03:00 UTC do dia 14
      expect(startUtc.toISOString()).toBe('2026-04-14T03:00:00.000Z')
      // 23:59:59.999 BRT do dia 14 = 02:59:59.999 UTC do dia 15
      expect(endUtc.toISOString()).toBe('2026-04-15T02:59:59.999Z')
    })

    it('janela startUtc..endUtc cobre exatamente 24 horas menos 1ms', () => {
      const now = new Date('2026-04-14T10:00:00.000Z')
      const { startUtc, endUtc } = getBrtDayBounds(now)
      const diffMs = endUtc.getTime() - startUtc.getTime()
      expect(diffMs).toBe(24 * 60 * 60 * 1000 - 1)
    })

    it('funciona corretamente quando now está no limite antes da meia-noite BRT', () => {
      // 2026-04-14T02:59:59Z = 2026-04-13T23:59:59 BRT
      const now = new Date('2026-04-14T02:59:59.000Z')
      const { startUtc, endUtc } = getBrtDayBounds(now)
      // Deve usar o dia BRT 13, então start = 03:00 UTC do dia 13
      expect(startUtc.toISOString()).toBe('2026-04-13T03:00:00.000Z')
      expect(endUtc.toISOString()).toBe('2026-04-14T02:59:59.999Z')
    })
  })

  describe('nextMidnightBRT', () => {
    it('retorna a próxima meia-noite BRT expressa como UTC', () => {
      // 2026-04-14T10:00:00Z = 2026-04-14T07:00:00 BRT
      // Próxima meia-noite BRT = 2026-04-15T00:00:00 BRT = 2026-04-15T03:00:00 UTC
      const now = new Date('2026-04-14T10:00:00.000Z')
      const midnight = nextMidnightBRT(now)
      expect(midnight.toISOString()).toBe('2026-04-15T03:00:00.000Z')
    })

    it('calcula corretamente quando now está às 23:59 BRT (borda de dia)', () => {
      // 2026-04-14T02:59:00Z = 2026-04-13T23:59:00 BRT
      // Próxima meia-noite BRT = 2026-04-14T00:00:00 BRT = 2026-04-14T03:00:00 UTC
      const now = new Date('2026-04-14T02:59:00.000Z')
      const midnight = nextMidnightBRT(now)
      expect(midnight.toISOString()).toBe('2026-04-14T03:00:00.000Z')
    })

    it('retorna meia-noite do próximo dia BRT, não UTC', () => {
      // 01:00 UTC = 22:00 BRT do dia anterior — meia-noite BRT deve ser do mesmo dia UTC
      const now = new Date('2026-04-14T01:00:00.000Z')
      const midnight = nextMidnightBRT(now)
      // Estamos no dia 13 BRT, então próxima meia-noite BRT = 2026-04-14T03:00 UTC
      expect(midnight.toISOString()).toBe('2026-04-14T03:00:00.000Z')
    })
  })

  describe('secondsUntilMidnightBRT', () => {
    it('retorna o número correto de segundos até a meia-noite BRT', () => {
      // 2026-04-14T10:00:00Z, próxima meia-noite BRT = 2026-04-15T03:00:00Z
      // Diff = 17h = 61200s
      const now = new Date('2026-04-14T10:00:00.000Z')
      expect(secondsUntilMidnightBRT(now)).toBe(61200)
    })

    it('retorna valor positivo mesmo às 23:59:59 BRT (1 segundo antes)', () => {
      // 2026-04-14T02:59:59.000Z = 2026-04-13T23:59:59 BRT
      const now = new Date('2026-04-14T02:59:59.000Z')
      const secs = secondsUntilMidnightBRT(now)
      expect(secs).toBe(1)
    })

    it('nunca retorna zero ou negativo', () => {
      // Exatamente na meia-noite BRT
      const now = new Date('2026-04-14T03:00:00.000Z')
      const secs = secondsUntilMidnightBRT(now)
      expect(secs).toBeGreaterThan(0)
    })

    it('retorna no máximo 86400 segundos (24h)', () => {
      const now = new Date('2026-04-14T03:00:01.000Z') // 1 segundo depois da meia-noite BRT
      const secs = secondsUntilMidnightBRT(now)
      expect(secs).toBeLessThanOrEqual(86400)
    })
  })

  describe('formatTimeUntilReset', () => {
    it('formata horas inteiras (sem minutos fracionados)', () => {
      // 2026-04-14T10:00:00Z -> próxima meia-noite BRT = 2026-04-15T03:00:00Z -> 17h exatos
      const result = formatTimeUntilReset(new Date('2026-04-14T10:00:00.000Z'))
      expect(result).toBe('17h')
    })

    it('formata horas com minutos quando não é hora exata', () => {
      // 2026-04-14T12:30:00Z -> próxima meia-noite BRT = 2026-04-15T03:00:00Z -> 14h30min
      const result = formatTimeUntilReset(new Date('2026-04-14T12:30:00.000Z'))
      expect(result).toBe('14h30min')
    })

    it('formata apenas minutos quando menos de 1 hora', () => {
      // 2026-04-15T02:15:00Z = 2026-04-14T23:15:00 BRT -> 45 minutos até meia-noite BRT
      const result = formatTimeUntilReset(new Date('2026-04-15T02:15:00.000Z'))
      expect(result).toBe('45min')
    })
  })
})
