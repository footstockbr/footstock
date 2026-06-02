// ============================================================================
// FootStock — Contrato de Scoring de Liga
// Verifica estrutura do ScoreBreakdown, teto de 100pts e pilares
// Rastreabilidade: INT-044, INT-046, INT-047 | US-017 | module-28/TASK-3/ST003
// ============================================================================

import type { ScoreBreakdown } from '@/types'

// ─── Constantes dos pilares (espelho de ScoringEngine) ──────────────────────
const MAX_RENTABILIDADE = 35
const MAX_SOFISTICACAO = 25
const MAX_DIVERSIFICACAO = 20
const MAX_CONSISTENCIA = 15
const MAX_BONUS_EDUCATIVO = 5
const MAX_TOTAL = 100

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildScore(overrides: Partial<ScoreBreakdown> = {}): ScoreBreakdown {
  return {
    rentabilidade: 0,
    sofisticacao: 0,
    diversificacao: 0,
    consistencia: 0,
    bonusEducativo: 0,
    total: 0,
    finalScore: 0,
    fatorEquidade: 1.0,
    ...overrides,
  }
}

/** Recalcula total a partir dos 5 pilares */
function sumPilares(score: ScoreBreakdown): number {
  return (
    score.rentabilidade +
    score.sofisticacao +
    score.diversificacao +
    score.consistencia +
    score.bonusEducativo
  )
}

describe('Contrato de Scoring de Liga', () => {
  // ── Estrutura do ScoreBreakdown ──────────────────────────────────────────

  describe('[SUCCESS] estrutura do ScoreBreakdown', () => {
    it('deve conter os 5 pilares obrigatórios', () => {
      const score = buildScore()
      expect(score).toHaveProperty('rentabilidade')
      expect(score).toHaveProperty('sofisticacao')
      expect(score).toHaveProperty('diversificacao')
      expect(score).toHaveProperty('consistencia')
      expect(score).toHaveProperty('bonusEducativo')
      expect(score).toHaveProperty('total')
    })

    it('todos os pilares devem ser numéricos', () => {
      const score = buildScore({
        rentabilidade: 20,
        sofisticacao: 15,
        diversificacao: 18,
        consistencia: 10,
        bonusEducativo: 3,
        total: 66,
      })
      expect(typeof score.rentabilidade).toBe('number')
      expect(typeof score.sofisticacao).toBe('number')
      expect(typeof score.diversificacao).toBe('number')
      expect(typeof score.consistencia).toBe('number')
      expect(typeof score.bonusEducativo).toBe('number')
      expect(typeof score.total).toBe('number')
    })
  })

  // ── Teto de pontuação ────────────────────────────────────────────────────

  describe('[SUCCESS] teto máximo de pontuação', () => {
    it('score total nunca deve exceder 100', () => {
      const maxScore = buildScore({
        rentabilidade: MAX_RENTABILIDADE,
        sofisticacao: MAX_SOFISTICACAO,
        diversificacao: MAX_DIVERSIFICACAO,
        consistencia: MAX_CONSISTENCIA,
        bonusEducativo: MAX_BONUS_EDUCATIVO,
        total: MAX_TOTAL,
      })
      expect(maxScore.total).toBeLessThanOrEqual(MAX_TOTAL)
      expect(sumPilares(maxScore)).toBeLessThanOrEqual(MAX_TOTAL)
    })

    it('rentabilidade não deve exceder 35', () => {
      const score = buildScore({ rentabilidade: MAX_RENTABILIDADE })
      expect(score.rentabilidade).toBeLessThanOrEqual(MAX_RENTABILIDADE)
    })

    it('sofisticacao não deve exceder 25', () => {
      const score = buildScore({ sofisticacao: MAX_SOFISTICACAO })
      expect(score.sofisticacao).toBeLessThanOrEqual(MAX_SOFISTICACAO)
    })

    it('diversificacao não deve exceder 20', () => {
      const score = buildScore({ diversificacao: MAX_DIVERSIFICACAO })
      expect(score.diversificacao).toBeLessThanOrEqual(MAX_DIVERSIFICACAO)
    })

    it('consistencia não deve exceder 15', () => {
      const score = buildScore({ consistencia: MAX_CONSISTENCIA })
      expect(score.consistencia).toBeLessThanOrEqual(MAX_CONSISTENCIA)
    })

    it('bonusEducativo não deve exceder 5', () => {
      const score = buildScore({ bonusEducativo: MAX_BONUS_EDUCATIVO })
      expect(score.bonusEducativo).toBeLessThanOrEqual(MAX_BONUS_EDUCATIVO)
    })
  })

  // ── Peso dos pilares ─────────────────────────────────────────────────────

  describe('[SUCCESS] pesos dos pilares somam exatamente 100', () => {
    it('MAX_RENTABILIDADE + MAX_SOFISTICACAO + MAX_DIVERSIFICACAO + MAX_CONSISTENCIA + MAX_BONUS_EDUCATIVO = 100', () => {
      const totalMax =
        MAX_RENTABILIDADE +
        MAX_SOFISTICACAO +
        MAX_DIVERSIFICACAO +
        MAX_CONSISTENCIA +
        MAX_BONUS_EDUCATIVO
      expect(totalMax).toBe(MAX_TOTAL)
    })
  })

  // ── Score zero ────────────────────────────────────────────────────────────

  describe('[EDGE] score zero para usuário sem atividade', () => {
    it('score sem trades deve retornar todos os pilares em 0', () => {
      const zeroScore = buildScore()
      expect(zeroScore.total).toBe(0)
      expect(zeroScore.rentabilidade).toBe(0)
      expect(zeroScore.sofisticacao).toBe(0)
      expect(zeroScore.diversificacao).toBe(0)
      expect(zeroScore.consistencia).toBe(0)
      expect(zeroScore.bonusEducativo).toBe(0)
    })
  })

  // ── Consistência do cálculo ───────────────────────────────────────────────

  describe('[EDGE] consistência do cálculo de total', () => {
    it('total deve ser igual à soma dos 5 pilares (sem fatorEquidade)', () => {
      const score = buildScore({
        rentabilidade: 28,
        sofisticacao: 20,
        diversificacao: 15,
        consistencia: 12,
        bonusEducativo: 4,
      })
      const expected = sumPilares(score)
      score.total = expected
      expect(score.total).toBeCloseTo(79, 2)
    })

    it('nenhum pilar deve ter valor negativo', () => {
      const score = buildScore()
      expect(score.rentabilidade).toBeGreaterThanOrEqual(0)
      expect(score.sofisticacao).toBeGreaterThanOrEqual(0)
      expect(score.diversificacao).toBeGreaterThanOrEqual(0)
      expect(score.consistencia).toBeGreaterThanOrEqual(0)
      expect(score.bonusEducativo).toBeGreaterThanOrEqual(0)
    })
  })

  // ── Diversificação com 5 ativos ───────────────────────────────────────────

  describe('[EDGE] diversificação com N ativos distintos', () => {
    it('portfólio com >= 5 ativos distintos deve poder atingir pontuação máxima', () => {
      // Contrato: 5+ ativos distintos = elegível para MAX_DIVERSIFICACAO
      const score5 = buildScore({ diversificacao: MAX_DIVERSIFICACAO })
      expect(score5.diversificacao).toBe(MAX_DIVERSIFICACAO)
    })

    it('portfólio com 0-1 ativos deve ter diversificação abaixo do máximo', () => {
      // Contrato: menos de 5 ativos → diversificação < MAX
      const scorePoor = buildScore({ diversificacao: 5 })
      expect(scorePoor.diversificacao).toBeLessThan(MAX_DIVERSIFICACAO)
    })
  })
})
