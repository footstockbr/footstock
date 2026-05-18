/**
 * @jest-environment node
 */
// ============================================================================
// TESTE DE REGRESSÃO DE CONTRATO — falha = breaking change em module-17/module-14
// Rastreabilidade: INT-046, INT-047
// ============================================================================

import {
  NEWS_INJECT_CHANNEL,
  validateNewsInjectPayload,
  sentimentToDurationTicks,
} from '../news-inject-contract'

describe('news-inject-contract', () => {
  const validPayload = {
    title: 'FLM vence por 3x0',
    ticker: 'FLM',
    impactCategory: 'ESPORTIVA_MAJORITARIA',
    sentiment: 0.8,
    source: 'ESPN Brasil',
    publishedAt: '2026-03-25T09:00:00.000Z',
  }

  test('[INFRA] NEWS_INJECT_CHANNEL é "news:inject"', () => {
    expect(NEWS_INJECT_CHANNEL).toBe('news:inject')
  })

  test('[SUCCESS] payload válido retorna true', () => {
    expect(validateNewsInjectPayload(validPayload)).toBe(true)
  })

  test('[ERROR — Ticker ausente] retorna false', () => {
    const { ticker: _, ...noTicker } = validPayload
    expect(validateNewsInjectPayload(noTicker)).toBe(false)
  })

  test('[ERROR — Sentiment > 1] retorna false', () => {
    expect(validateNewsInjectPayload({ ...validPayload, sentiment: 1.5 })).toBe(false)
  })

  test('[ERROR — Sentiment < -1] retorna false', () => {
    expect(validateNewsInjectPayload({ ...validPayload, sentiment: -1.5 })).toBe(false)
  })

  test('[ERROR — Ticker muito longo (>4 chars)] retorna false', () => {
    expect(validateNewsInjectPayload({ ...validPayload, ticker: 'FLAMENGO' })).toBe(false)
  })

  test('[ERROR — publishedAt não é ISO 8601] retorna false', () => {
    expect(validateNewsInjectPayload({ ...validPayload, publishedAt: '25/03/2026' })).toBe(false)
  })

  test('[EDGE — Campos extras] retorna true (forward-compat)', () => {
    expect(validateNewsInjectPayload({ ...validPayload, extraField: true })).toBe(true)
  })

  test('[INFRA] validateNewsInjectPayload({}) retorna false sem exceção', () => {
    expect(() => validateNewsInjectPayload({})).not.toThrow()
    expect(validateNewsInjectPayload({})).toBe(false)
  })

  test('[INFRA] sentimentToDurationTicks retorna NEWS_IMPACT_DURATION_TICKS independente do sentiment', () => {
    // Sentiment não é mais driver da duração — a curva de L7 exige o total fixo
    // (PRESSURE_SPREAD_TICKS + ABSORPTION_TICKS). Ver news-inject-contract.ts.
    const ticks = [0, 0.5, 1, -1, 0.2].map(sentimentToDurationTicks)
    ticks.forEach(t => {
      expect(t).toBe(50)
    })
  })
})
