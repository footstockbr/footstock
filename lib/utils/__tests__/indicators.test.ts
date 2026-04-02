import { calcSMA, calcBollinger, type Candle } from '../indicators'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandles(closes: number[]): Candle[] {
  return closes.map((close, i) => ({
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    timestamp: 1_700_000_000_000 + i * 60_000,
  }))
}

// ---------------------------------------------------------------------------
// calcSMA
// ---------------------------------------------------------------------------

describe('calcSMA', () => {
  test('retorna pontos corretos para period=3 com 5 candles', () => {
    // closes: [10, 20, 30, 40, 50]
    // janelas: [10,20,30]→20, [20,30,40]→30, [30,40,50]→40
    const candles = makeCandles([10, 20, 30, 40, 50])
    const result = calcSMA(candles, 3)

    expect(result).toHaveLength(3)
    expect(result[0]!.value).toBeCloseTo(20)
    expect(result[1]!.value).toBeCloseTo(30)
    expect(result[2]!.value).toBeCloseTo(40)
  })

  test('timestamps correspondem ao candle final de cada janela', () => {
    const candles = makeCandles([10, 20, 30])
    const result = calcSMA(candles, 2)

    expect(result).toHaveLength(2)
    expect(result[0]!.timestamp).toBe(candles[1]!.timestamp)
    expect(result[1]!.timestamp).toBe(candles[2]!.timestamp)
  })

  test('retorna vazio se candles.length < period', () => {
    const candles = makeCandles([10, 20])
    expect(calcSMA(candles, 3)).toHaveLength(0)
  })

  test('retorna vazio para array vazio', () => {
    expect(calcSMA([], 5)).toHaveLength(0)
  })

  test('period=1 retorna o proprio close de cada candle', () => {
    const candles = makeCandles([5, 15, 25])
    const result = calcSMA(candles, 1)

    expect(result).toHaveLength(3)
    expect(result[0]!.value).toBeCloseTo(5)
    expect(result[1]!.value).toBeCloseTo(15)
    expect(result[2]!.value).toBeCloseTo(25)
  })

  test('period exatamente igual ao numero de candles retorna 1 ponto', () => {
    const candles = makeCandles([10, 20, 30])
    const result = calcSMA(candles, 3)

    expect(result).toHaveLength(1)
    expect(result[0]!.value).toBeCloseTo(20)
  })

  test('valores de ponto flutuante calculados corretamente', () => {
    const candles = makeCandles([1.5, 2.5, 3.5])
    const result = calcSMA(candles, 3)

    expect(result).toHaveLength(1)
    expect(result[0]!.value).toBeCloseTo(2.5)
  })

  test('period=0 retorna vazio', () => {
    const candles = makeCandles([10, 20, 30])
    expect(calcSMA(candles, 0)).toHaveLength(0)
  })

  test('candles identicos resultam em SMA igual ao close', () => {
    const candles = makeCandles([100, 100, 100, 100, 100])
    const result = calcSMA(candles, 3)

    expect(result).toHaveLength(3)
    result.forEach((p) => expect(p.value).toBeCloseTo(100))
  })
})

// ---------------------------------------------------------------------------
// calcBollinger
// ---------------------------------------------------------------------------

describe('calcBollinger', () => {
  test('retorna vazio para array vazio', () => {
    expect(calcBollinger([])).toHaveLength(0)
  })

  test('retorna vazio se candles.length < period', () => {
    const candles = makeCandles([10, 20])
    expect(calcBollinger(candles, 3)).toHaveLength(0)
  })

  test('middle e igual a SMA para mesma janela', () => {
    const closes = [10, 20, 30, 40, 50]
    const candles = makeCandles(closes)
    const bb = calcBollinger(candles, 3)
    const sma = calcSMA(candles, 3)

    expect(bb).toHaveLength(sma.length)
    bb.forEach((band, i) => {
      expect(band.middle).toBeCloseTo(sma[i]!.value)
    })
  })

  test('upper > middle > lower para dados com variancia', () => {
    const candles = makeCandles([10, 20, 30, 40, 50])
    const result = calcBollinger(candles, 3)

    result.forEach((band) => {
      expect(band.upper).toBeGreaterThan(band.middle)
      expect(band.middle).toBeGreaterThan(band.lower)
    })
  })

  test('upper e lower simetricos em torno do middle', () => {
    const candles = makeCandles([10, 20, 30, 40, 50])
    const result = calcBollinger(candles, 3)

    result.forEach((band) => {
      const upperDiff = band.upper - band.middle
      const lowerDiff = band.middle - band.lower
      expect(upperDiff).toBeCloseTo(lowerDiff, 10)
    })
  })

  test('bandas colapsam para zero quando todos os candles sao identicos', () => {
    // Desvio padrao de valores iguais e 0 → upper = lower = middle
    const candles = makeCandles([50, 50, 50, 50, 50])
    const result = calcBollinger(candles, 3)

    result.forEach((band) => {
      expect(band.upper).toBeCloseTo(band.middle)
      expect(band.lower).toBeCloseTo(band.middle)
    })
  })

  test('valores conhecidos — period=3, stdDev=2 sobre [10,20,30]', () => {
    // mean = 20, variância = [(10-20)²+(20-20)²+(30-20)²]/3 = 200/3
    // sigma = sqrt(200/3) ≈ 8.165
    // upper = 20 + 2*8.165 ≈ 36.33, lower = 20 - 2*8.165 ≈ 3.67
    const candles = makeCandles([10, 20, 30])
    const result = calcBollinger(candles, 3, 2)

    expect(result).toHaveLength(1)
    const sigma = Math.sqrt((Math.pow(10 - 20, 2) + Math.pow(20 - 20, 2) + Math.pow(30 - 20, 2)) / 3)
    expect(result[0]!.middle).toBeCloseTo(20)
    expect(result[0]!.upper).toBeCloseTo(20 + 2 * sigma)
    expect(result[0]!.lower).toBeCloseTo(20 - 2 * sigma)
  })

  test('stdDev=1 produz bandas mais estreitas que stdDev=2', () => {
    const candles = makeCandles([10, 20, 30, 40, 50])
    const bb1 = calcBollinger(candles, 3, 1)
    const bb2 = calcBollinger(candles, 3, 2)

    bb1.forEach((band, i) => {
      expect(bb2[i]!.upper - bb2[i]!.lower).toBeGreaterThan(band.upper - band.lower)
    })
  })

  test('timestamps correspondem ao candle final de cada janela', () => {
    const candles = makeCandles([10, 20, 30, 40, 50])
    const result = calcBollinger(candles, 3)

    expect(result[0]!.timestamp).toBe(candles[2]!.timestamp)
    expect(result[1]!.timestamp).toBe(candles[3]!.timestamp)
    expect(result[2]!.timestamp).toBe(candles[4]!.timestamp)
  })

  test('period=1 com stdDev=2 produz bandas colapsadas (sigma=0)', () => {
    const candles = makeCandles([10, 20, 30])
    const result = calcBollinger(candles, 1, 2)

    expect(result).toHaveLength(3)
    result.forEach((band) => {
      expect(band.upper).toBeCloseTo(band.middle)
      expect(band.lower).toBeCloseTo(band.middle)
    })
  })
})
