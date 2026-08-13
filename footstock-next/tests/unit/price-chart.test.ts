/**
 * Task 05 — Testes das funções puras do PriceChart.
 *
 * Foco: fidelidade aos candles (downsample preserva extremos, linha canônica sem
 * EMA, comparação por timestamp).
 */

import { downsample, toCompareSeries } from '@/components/market/PriceChart'
import type { Candle } from '@/lib/utils/indicators'

function makeCandles(count: number): Candle[] {
  const base = 1_700_000_000
  return Array.from({ length: count }, (_, i) => ({
    timestamp: base + i * 60,
    open: 50 + i,
    high: 52 + i,
    low: 49 + i,
    close: 51 + i,
    volume: 100,
  }))
}

describe('downsample', () => {
  test('retorna dados originais quando count <= maxPoints', () => {
    const data = makeCandles(10)
    expect(downsample(data, 20)).toEqual(data)
  })

  test('sempre preserva primeiro e último pontos', () => {
    const data = makeCandles(1000)
    const result = downsample(data, 10)

    expect(result[0].timestamp).toBe(data[0].timestamp)
    expect(result[result.length - 1].timestamp).toBe(data[data.length - 1].timestamp)
  })

  test('respeita maxPoints', () => {
    const data = makeCandles(1000)
    const result = downsample(data, 50)
    expect(result.length).toBe(50)
  })
})

describe('toCompareSeries', () => {
  test('retorna array vazio quando não há candles', () => {
    expect(toCompareSeries([], new Set())).toEqual([])
  })

  test('normaliza pela abertura e alinha por timestamp', () => {
    const base = 1_700_000_000
    const candles: Candle[] = [
      { timestamp: base, open: 50, high: 52, low: 49, close: 50, volume: 100 },
      { timestamp: base + 60, open: 51, high: 53, low: 50, close: 52, volume: 100 },
      { timestamp: base + 120, open: 52, high: 54, low: 51, close: 51, volume: 100 },
    ]
    const refTimestamps = new Set([base, base + 60, base + 120])

    const result = toCompareSeries(candles, refTimestamps)

    expect(result).toHaveLength(3)
    expect(result[0].value).toBe(0)
    expect(result[1].value).toBe(4)
    expect(result[2].value).toBe(2)
  })

  test('ignora timestamps que não estão no conjunto de referência', () => {
    const base = 1_700_000_000
    const candles: Candle[] = [
      { timestamp: base, open: 50, high: 52, low: 49, close: 50, volume: 100 },
      { timestamp: base + 60, open: 51, high: 53, low: 50, close: 52, volume: 100 },
      { timestamp: base + 999, open: 52, high: 54, low: 51, close: 51, volume: 100 },
    ]
    const refTimestamps = new Set([base, base + 60])

    const result = toCompareSeries(candles, refTimestamps)

    expect(result).toHaveLength(2)
    expect(result[1].value).toBe(4)
  })
})
