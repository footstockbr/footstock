/**
 * Task 03 — Testes unitários do PriceHistoryRepository.
 *
 * Cobrem: agregação OHLCV, buckets allowlisted, seleção dos buckets mais
 * recentes, volume por deltas positivos e preservação do último close elegível.
 */

const mockFindUnique = jest.fn()
const mockQueryRaw = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
  },
}))

import { PriceHistoryRepository } from '@/lib/repositories/PriceHistoryRepository'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('PriceHistoryRepository.findByTicker', () => {
  test('ativo inexistente retorna array vazio', async () => {
    mockFindUnique.mockResolvedValue(null)

    const result = await PriceHistoryRepository.findByTicker('XYZ9')

    expect(result).toEqual([])
  })

  test('período não allowlisted lança erro', async () => {
    mockFindUnique.mockResolvedValue({ id: 'asset-1', ticker: 'FLA1' })

    await expect(
      PriceHistoryRepository.findByTicker('FLA1', { period: '5Y' as any })
    ).rejects.toThrow('Período não suportado')
  })

  test('período desabilitado (3M) lança erro com hipotese H6', async () => {
    mockFindUnique.mockResolvedValue({ id: 'asset-1', ticker: 'FLA1' })

    await expect(
      PriceHistoryRepository.findByTicker('FLA1', { period: '3M' })
    ).rejects.toThrow(/hipotese: H6/)
  })

  test('agregação mapeia rows do PostgreSQL para candles', async () => {
    mockFindUnique.mockResolvedValue({ id: 'asset-1', ticker: 'FLA1' })
    mockQueryRaw.mockResolvedValue([
      {
        timestamp: new Date('2026-08-13T12:00:00.000Z'),
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 100,
        source: 'REAL',
      },
      {
        timestamp: new Date('2026-08-13T16:00:00.000Z'),
        open: 11,
        high: 14,
        low: 10,
        close: 13,
        volume: 250,
        source: 'REAL',
      },
    ])

    const result = await PriceHistoryRepository.findByTicker('FLA1', {
      period: '1M',
      to: new Date('2026-08-13T18:00:00.000Z'),
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      timestamp: '2026-08-13T12:00:00.000Z',
      open: 10,
      high: 12,
      low: 9,
      close: 11,
      volume: 100,
      source: 'REAL',
    })
    expect(result[1].close).toBe(13)
  })

  test('preserva último close elegível mesmo com mais de 5.000 snapshots', async () => {
    mockFindUnique.mockResolvedValue({ id: 'asset-1', ticker: 'FLA1' })

    const cutoff = new Date('2026-08-13T17:00:00.000Z')
    const rows = []
    for (let i = 0; i < 6001; i++) {
      rows.push({
        timestamp: new Date(cutoff.getTime() - (6000 - i) * 60_000),
        open: 50,
        high: 51,
        low: 49,
        close: 50 + (i % 5),
        volume: 100,
        source: 'REAL',
      })
    }
    mockQueryRaw.mockResolvedValue(rows)

    const result = await PriceHistoryRepository.findByTicker('FLA1', {
      period: '1M',
      to: cutoff,
    })

    expect(result.length).toBeGreaterThan(0)
    const last = result[result.length - 1]
    expect(new Date(last.timestamp).getTime()).toBeLessThanOrEqual(cutoff.getTime())
    expect(last.close).toBe(rows[rows.length - 1].close)
  })

  test('ALL é allowlisted e habilitado para testes de cutoff', async () => {
    mockFindUnique.mockResolvedValue({ id: 'asset-1', ticker: 'FLA1' })
    mockQueryRaw.mockResolvedValue([
      {
        timestamp: new Date('2026-08-13T16:00:00.000Z'),
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 100,
        source: 'REAL',
      },
    ])

    const result = await PriceHistoryRepository.findByTicker('FLA1', {
      period: 'ALL',
      to: new Date('2026-08-13T18:00:00.000Z'),
    })

    expect(result).toHaveLength(1)
  })
})

describe('PriceHistoryRepository.getGranularity', () => {
  test.each([
    ['1H', 'minute'],
    ['1D', 'minute'],
    ['1W', 'hourly'],
    ['1S', 'hourly'],
    ['1M', 'daily'],
    ['ALL', 'weekly'],
  ] as const)('%s -> %s', (period, expected) => {
    expect(PriceHistoryRepository.getGranularity(period)).toBe(expected)
  })
})
