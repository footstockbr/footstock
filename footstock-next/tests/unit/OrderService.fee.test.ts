// ============================================================================
// Foot Stock — Testes unitários: calculateFee (Taxa Operacional Escalonada)
// Rastreabilidade: T-018 — Acceptance Criteria completos
// ============================================================================

import { calculateFee, OPERATIONAL_FEES } from '@/lib/constants/limits'

describe('calculateFee — taxa operacional escalonada', () => {
  // ── Acceptance Criteria canônicos (do TASK-018) ─────────────────────────────

  describe('AC: valores canônicos', () => {
    it('calculateFee(400) retorna 0.25', () => {
      expect(calculateFee(400)).toBe(0.25)
    })

    it('calculateFee(500) retorna 0.25 — limite superior da faixa 1 (inclusivo)', () => {
      expect(calculateFee(500)).toBe(0.25)
    })

    it('calculateFee(501) retorna 0.35 — inicio da faixa 2', () => {
      expect(calculateFee(501)).toBe(0.35)
    })

    it('calculateFee(1000) retorna 0.35 — limite superior da faixa 2 (inclusivo)', () => {
      expect(calculateFee(1000)).toBe(0.35)
    })

    it('calculateFee(1001) retorna 0.45 — inicio da faixa 3', () => {
      expect(calculateFee(1001)).toBe(0.45)
    })

    it('calculateFee(5000) retorna 0.45', () => {
      expect(calculateFee(5000)).toBe(0.45)
    })
  })

  // ── Casos de contorno explícitos ─────────────────────────────────────────────

  describe('limites de faixa — boundary cases', () => {
    it('499.99 → faixa 1 (0.25)', () => {
      expect(calculateFee(499.99)).toBe(0.25)
    })

    it('500.00 → faixa 1 (0.25) — threshold inclusivo', () => {
      expect(calculateFee(500)).toBe(0.25)
    })

    it('500.01 → faixa 2 (0.35)', () => {
      expect(calculateFee(500.01)).toBe(0.35)
    })

    it('999.99 → faixa 2 (0.35)', () => {
      expect(calculateFee(999.99)).toBe(0.35)
    })

    it('1000.00 → faixa 2 (0.35) — threshold inclusivo', () => {
      expect(calculateFee(1000)).toBe(0.35)
    })

    it('1000.01 → faixa 3 (0.45)', () => {
      expect(calculateFee(1000.01)).toBe(0.45)
    })
  })

  // ── Funções puras — sem side effects ─────────────────────────────────────────

  describe('pureza da função', () => {
    it('chamar duas vezes com o mesmo argumento retorna o mesmo resultado', () => {
      expect(calculateFee(750)).toBe(calculateFee(750))
    })

    it('não modifica a constante OPERATIONAL_FEES', () => {
      const beforeLength = OPERATIONAL_FEES.length
      calculateFee(999)
      expect(OPERATIONAL_FEES.length).toBe(beforeLength)
    })
  })

  // ── Valores extremos ──────────────────────────────────────────────────────────

  describe('valores extremos', () => {
    it('operação de 0 → faixa 1 (0.25)', () => {
      expect(calculateFee(0)).toBe(0.25)
    })

    it('operação muito grande → faixa 3 (0.45)', () => {
      expect(calculateFee(1_000_000)).toBe(0.45)
    })

    it('operação = 1 → faixa 1 (0.25)', () => {
      expect(calculateFee(1)).toBe(0.25)
    })
  })

  // ── Simulações de uso real ────────────────────────────────────────────────────

  describe('simulações de uso real', () => {
    it('ordem MARKET executada a FS$750 (300 cotas x 2.50) → taxa FS$0.35', () => {
      // quantity=300, price=2.50 → operationValue=750 → faixa 2
      const operationValue = 300 * 2.50
      expect(operationValue).toBe(750)
      expect(calculateFee(operationValue)).toBe(0.35)
    })

    it('ordem executada a FS$850 (LIMIT criada a 900, executada a 850) → taxa sobre 850', () => {
      // Taxa calculada sobre preço de execução (850), não sobre preço limite (900)
      const executionValue = 1 * 850   // 1 cota x 850 = 850 (faixa 2)
      const limitValue = 1 * 900       // teria sido faixa 2 de qualquer forma
      expect(calculateFee(executionValue)).toBe(0.35)
      expect(calculateFee(limitValue)).toBe(0.35)
    })

    it('UI: digitar FS$800 → exibir "Taxa estimada: FS$0.35"', () => {
      expect(calculateFee(800)).toBe(0.35)
    })

    it('operação pequena FS$100 → taxa mínima FS$0.25', () => {
      expect(calculateFee(100)).toBe(0.25)
    })

    it('operação grande FS$2000 → taxa máxima FS$0.45', () => {
      expect(calculateFee(2000)).toBe(0.45)
    })
  })

  // ── Consistência das tiers ────────────────────────────────────────────────────

  describe('consistência das faixas', () => {
    it('os 3 tiers estão presentes na constante OPERATIONAL_FEES', () => {
      expect(OPERATIONAL_FEES).toHaveLength(3)
    })

    it('tier 1: threshold 500, fee 0.25', () => {
      expect(OPERATIONAL_FEES[0]).toEqual({ threshold: 500, fee: 0.25 })
    })

    it('tier 2: threshold 1000, fee 0.35', () => {
      expect(OPERATIONAL_FEES[1]).toEqual({ threshold: 1000, fee: 0.35 })
    })

    it('tier 3: threshold Infinity, fee 0.45', () => {
      expect(OPERATIONAL_FEES[2]).toEqual({ threshold: Infinity, fee: 0.45 })
    })
  })
})
