// ============================================================================
// Testes — NewsSentimentWindow (task-007)
// ============================================================================

import {
  computeWindowComponent,
  buildWindowExitReason,
  NEWS_WINDOW_HOURS,
  NORMALIZATION_CONFIDENCE_C,
  type NewsWindowRow,
} from '../NewsSentimentWindow'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<NewsWindowRow> = {}): NewsWindowRow {
  return {
    id: `news-${Math.random().toString(36).slice(2, 8)}`,
    ticker: 'FLAM3',
    sentiment: 'NEUTRAL',
    publishedAt: new Date(),
    sentimentClassifiedAt: new Date(),
    ...overrides,
  }
}

// ─── computeWindowComponent ──────────────────────────────────────────────────

describe('computeWindowComponent', () => {
  it('retorna 0 quando não há notícias', () => {
    const result = computeWindowComponent([])
    expect(result.value).toBe(0)
    expect(result.count).toBe(0)
  })

  it('calcula valor positivo quando só há notícias BULLISH', () => {
    const rows = [
      makeRow({ sentiment: 'BULLISH' }),
      makeRow({ sentiment: 'BULLISH' }),
      makeRow({ sentiment: 'BULLISH' }),
    ]
    const result = computeWindowComponent(rows)
    expect(result.positiveCount).toBe(3)
    expect(result.negativeCount).toBe(0)
    expect(result.value).toBeGreaterThan(0)
  })

  it('calcula valor negativo quando só há notícias BEARISH', () => {
    const rows = [
      makeRow({ sentiment: 'BEARISH' }),
      makeRow({ sentiment: 'BEARISH' }),
    ]
    const result = computeWindowComponent(rows)
    expect(result.positiveCount).toBe(0)
    expect(result.negativeCount).toBe(2)
    expect(result.value).toBeLessThan(0)
  })

  it('retorna 0 quando notícias se cancelam (BULLISH = BEARISH)', () => {
    const rows = [
      makeRow({ sentiment: 'BULLISH' }),
      makeRow({ sentiment: 'BEARISH' }),
    ]
    const result = computeWindowComponent(rows)
    expect(result.value).toBe(0)
  })

  it('NEUTRAL não contribui para direção, mas conta para cobertura', () => {
    const rows = [
      makeRow({ sentiment: 'BULLISH' }),
      makeRow({ sentiment: 'NEUTRAL' }),
      makeRow({ sentiment: 'NEUTRAL' }),
    ]
    const result = computeWindowComponent(rows)
    expect(result.positiveCount).toBe(1)
    expect(result.neutralCount).toBe(2)
    expect(result.count).toBe(3)
    // soma = 1, massa = 3 -> N = 1 / (3 + 3) = 0.1667
    expect(result.value).toBeCloseTo(1 / 6, 4)
  })

  it('normalização evita saturação com muitas notícias (Série A)', () => {
    // 15 notícias BULLISH: soma = 15, massa = 15 -> N = 15 / 18 = 0.8333
    const rows = Array.from({ length: 15 }, () => makeRow({ sentiment: 'BULLISH' }))
    const result = computeWindowComponent(rows)
    expect(result.value).toBeCloseTo(15 / 18, 4)
    expect(result.value).toBeLessThan(1.0) // NÃO satura
  })

  it('não satura em 1.0 por volume: mais notícias unânimes nunca fecham a divisão', () => {
    // A forma canônica soma/(massa + C) cresce monotonicamente mas nunca chega a 1.
    // 25 BULLISH -> 25 / 28 = 0.8929; 40 BULLISH -> 40 / 43 = 0.9302.
    const rows25 = Array.from({ length: 25 }, () => makeRow({ sentiment: 'BULLISH' }))
    const result25 = computeWindowComponent(rows25)
    expect(result25.value).toBeCloseTo(25 / 28, 4)
    expect(result25.value).toBeLessThan(1.0)

    const rows40 = Array.from({ length: 40 }, () => makeRow({ sentiment: 'BULLISH' }))
    const result40 = computeWindowComponent(rows40)
    expect(result40.value).toBeCloseTo(40 / 43, 4)
    expect(result40.value).toBeLessThan(1.0)

    // Monotônico: mais notícias na mesma direção aumentam a convicção...
    expect(result40.value).toBeGreaterThan(result25.value)
    // ...sem nunca alcançar o teto.
    expect(result40.value).toBeLessThan(1.0)
  })

  it('assimetria Série A vs Série B não satura a divisão', () => {
    // Série A: 12 notícias, todas BULLISH
    const serieA = Array.from({ length: 12 }, () => makeRow({ sentiment: 'BULLISH' }))
    const resultA = computeWindowComponent(serieA)

    // Série B: 3 notícias, todas BULLISH
    const serieB = Array.from({ length: 3 }, () => makeRow({ sentiment: 'BULLISH' }))
    const resultB = computeWindowComponent(serieB)

    // Série A: soma = 12, massa = 12 -> 12 / 15 = 0.80
    expect(resultA.value).toBeCloseTo(12 / 15, 4)
    // Série B: soma = 3, massa = 3 -> 3 / 6 = 0.50
    expect(resultB.value).toBeCloseTo(3 / 6, 4)
    // A razão A/B = 1.6x. Este é o ponto da fórmula v2: a assimetria de
    // cobertura de 5.5x entre as séries não vira assimetria de magnitude.
    expect(resultA.value / resultB.value).toBeCloseTo(1.6, 2)
    expect(resultA.value / resultB.value).toBeLessThan(2)
  })

  it('valor é clamped a [-1, +1]', () => {
    // Impossível ultrapassar com a fórmula canônica, mas testamos o clamp defensivo
    const rows = Array.from({ length: 100 }, () => makeRow({ sentiment: 'BULLISH' }))
    const result = computeWindowComponent(rows)
    expect(result.value).toBeCloseTo(100 / 103, 4)
    expect(result.value).toBeLessThanOrEqual(1)
    expect(result.value).toBeGreaterThanOrEqual(-1)
  })
})

// ─── buildWindowExitReason ───────────────────────────────────────────────────

describe('buildWindowExitReason', () => {
  it('retorna string vazia quando nenhuma notícia saiu', () => {
    const reason = buildWindowExitReason({
      exitedNewsCount: 0,
      exitedNewsSentiments: [],
      previousScore: 0.1,
      currentScore: 0.1,
    })
    expect(reason).toBe('')
  })

  it('registra saída de notícia BULLISH com mudança de score', () => {
    const reason = buildWindowExitReason({
      exitedNewsCount: 1,
      exitedNewsSentiments: ['BULLISH'],
      previousScore: 0.15,
      currentScore: 0.2,
    })
    expect(reason).toContain('1 notícia(s) saíram da janela')
    expect(reason).toContain('1 BULLISH')
    expect(reason).toContain('+0.15')
    expect(reason).toContain('+0.20')
  })

  it('registra saída de múltiplas notícias com sentimentos mistos', () => {
    const reason = buildWindowExitReason({
      exitedNewsCount: 3,
      exitedNewsSentiments: ['BULLISH', 'BEARISH', 'BEARISH'],
      previousScore: -0.05,
      currentScore: 0.1,
    })
    expect(reason).toContain('3 notícia(s) saíram da janela')
    expect(reason).toContain('1 BULLISH')
    expect(reason).toContain('2 BEARISH')
  })

  it('formata scores negativos corretamente', () => {
    const reason = buildWindowExitReason({
      exitedNewsCount: 1,
      exitedNewsSentiments: ['BEARISH'],
      previousScore: -0.2,
      currentScore: -0.1,
    })
    expect(reason).toContain('-0.20')
    expect(reason).toContain('-0.10')
  })
})

// ─── Constantes ──────────────────────────────────────────────────────────────

describe('constantes', () => {
  it('NEWS_WINDOW_HOURS = 72', () => {
    expect(NEWS_WINDOW_HOURS).toBe(72)
  })

  it('NORMALIZATION_CONFIDENCE_C = 3.0 (guard da forma canônica fixada na task-007)', () => {
    expect(NORMALIZATION_CONFIDENCE_C).toBe(3.0)
  })

  it('janela vazia devolve 0 pela própria forma canônica (0 / C), sem divisão por zero', () => {
    const result = computeWindowComponent([])
    expect(result.value).toBe(0)
    expect(Number.isFinite(result.value)).toBe(true)
  })
})
