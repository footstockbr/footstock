// ============================================================================
// FootStock — Contrato market:tick
// Verifica formato, frequência SLA e cobertura de 40 tickers
// Rastreabilidade: INT-098 | US-005 | module-28/TASK-1/ST002+ST004
// ============================================================================

import {
  MarketTickSchema,
  assertContractShape,
  assertTickFrequencySLA,
  CANONICAL_TICKERS,
} from '../helpers/contract-test-helpers'
import { RedisMock, createMockTick } from '../__mocks__/redis.mock'

describe('Contrato market:tick', () => {
  let mock: RedisMock

  beforeEach(() => {
    mock = new RedisMock()
  })

  afterEach(() => {
    mock.reset()
  })

  // ── Integridade da lista canônica ──────────────────────────────────────────

  describe('[EDGE] Integridade da lista canônica de tickers', () => {
    it('CANONICAL_TICKERS deve ter exatamente 40 entradas', () => {
      expect(CANONICAL_TICKERS).toHaveLength(40)
    })

    it('CANONICAL_TICKERS deve ter 40 entradas únicas (sem duplicatas)', () => {
      expect(new Set(CANONICAL_TICKERS).size).toBe(40)
    })

    it('todos os tickers devem ser strings não vazias sem espaços', () => {
      CANONICAL_TICKERS.forEach((ticker) => {
        expect(typeof ticker).toBe('string')
        expect(ticker.trim()).toBe(ticker)
        expect(ticker.length).toBeGreaterThan(0)
      })
    })
  })

  // ── Formato do payload ─────────────────────────────────────────────────────

  it('[SUCCESS] deve publicar tick com todos os campos obrigatórios e válidos', () => {
    const tick = createMockTick('URU3')
    mock.publish('market:tick', JSON.stringify(tick))

    const received = JSON.parse(mock.published['market:tick']![0]!)
    const result = MarketTickSchema.safeParse(received)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ticker).toBe('URU3')
      expect(result.data.price).toBeGreaterThan(0)
      expect(result.data.timestamp).toBeGreaterThan(0)
    }
  })

  it('[SUCCESS] assertContractShape valida payload correto sem lançar erro', () => {
    const tick = createMockTick('POR3')
    expect(() =>
      assertContractShape(MarketTickSchema, tick, 'market:tick'),
    ).not.toThrow()
  })

  // ── Frequência SLA ─────────────────────────────────────────────────────────

  it('[SUCCESS] deve publicar ticks com intervalo ≤2100ms (SLA)', () => {
    const timestamps: number[] = []

    mock.subscribe('market:tick', (_ch: string, msg: string) => {
      timestamps.push(JSON.parse(msg).timestamp)
    })

    // Simular motor publicando 6 ticks com intervalo de 2000ms
    for (let i = 0; i < 6; i++) {
      mock.publish(
        'market:tick',
        JSON.stringify(createMockTick('URU3', { timestamp: 1_000_000 + i * 2000 })),
      )
    }

    expect(timestamps).toHaveLength(6)
    assertTickFrequencySLA(timestamps, 2100, 'URU3')

    const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]!)
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
    expect(avg).toBeLessThanOrEqual(2100)
  })

  // ── Cobertura de 40 tickers ────────────────────────────────────────────────

  it('[SUCCESS] deve publicar para todos os tickers da lista canônica', () => {
    // Validar a lista primeiro
    expect(CANONICAL_TICKERS).toHaveLength(40)
    expect(new Set(CANONICAL_TICKERS).size).toBe(40)

    // Verificar cobertura completa
    CANONICAL_TICKERS.forEach((ticker) => {
      mock.publish('market:tick', JSON.stringify(createMockTick(ticker)))
    })

    const published = new Set(
      (mock.published['market:tick'] ?? []).map((m) => JSON.parse(m).ticker),
    )

    expect(published.size).toBe(40)
    CANONICAL_TICKERS.forEach((t) => expect(published.has(t)).toBe(true))
  })

  // ── Spread ─────────────────────────────────────────────────────────────────

  it('[EDGE] spread deve ser matematicamente igual a ask - bid', () => {
    const bid = 98.75
    const ask = 100.25
    const tick = createMockTick('RAP3', {
      bid,
      ask,
      spread: parseFloat((ask - bid).toFixed(10)),
    })
    mock.publish('market:tick', JSON.stringify(tick))

    const received = JSON.parse(mock.published['market:tick']![0]!)
    expect(received.spread).toBeCloseTo(received.ask - received.bid, 10)
  })

  // ── Sentimento inválido ────────────────────────────────────────────────────

  it('[EDGE] deve rejeitar tick com sentiment fora dos valores válidos do enum', () => {
    // Valores válidos: MUITO_POSITIVO | POSITIVO | NEUTRO | NEGATIVO | MUITO_NEGATIVO
    const invalidTick = { ...createMockTick('TIM3'), sentiment: 'bullish' }
    const result = MarketTickSchema.safeParse(invalidTick)

    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0])
      expect(paths).toContain('sentiment')
    }
  })

  // ── assertTickFrequencySLA detecta violação ────────────────────────────────

  it('[EDGE] assertTickFrequencySLA deve detectar violação de SLA', () => {
    const timestamps = [1000, 2000, 4200] // intervalo 2200ms > 2100ms
    expect(() => assertTickFrequencySLA(timestamps, 2100, 'FOG3')).toThrow(
      /SLA violado para FOG3/,
    )
  })
})
