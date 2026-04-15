/**
 * Testes unitarios do GBMGenerator
 * Referencia: TASK-025 (Historico de Graficos via GBM)
 *
 * Verifica:
 * - Determinismo (mesmo seed = mesmo output)
 * - Precos sempre positivos (> 0)
 * - Comprimento correto dos arrays
 * - Transicoes de regime funcionais
 * - Calibragem por cluster
 * - Candles OHLC validos (high >= open/close, low <= open/close)
 */

import {
  generateGBMPath,
  generateCandlesForPeriod,
  generateAllPeriodsForAsset,
  hashTicker,
  createPRNG,
  gaussianRandom,
  nextRegime,
  CANDLE_PERIODS,
  REGIME_PARAMS,
  CLUSTER_PARAMS,
  type MarketRegime,
  type AssetCluster,
} from '@/lib/services/GBMGenerator'

describe('GBMGenerator', () => {
  describe('hashTicker', () => {
    it('retorna um numero consistente para o mesmo ticker', () => {
      expect(hashTicker('URU3')).toBe(hashTicker('URU3'))
      expect(hashTicker('POR4')).toBe(hashTicker('POR4'))
    })

    it('retorna numeros diferentes para tickers diferentes', () => {
      expect(hashTicker('URU3')).not.toBe(hashTicker('POR4'))
      expect(hashTicker('TIM3')).not.toBe(hashTicker('GAL3'))
    })
  })

  describe('createPRNG', () => {
    it('gera sequencia deterministica para mesma seed', () => {
      const rng1 = createPRNG(42)
      const rng2 = createPRNG(42)

      const seq1 = Array.from({ length: 100 }, () => rng1())
      const seq2 = Array.from({ length: 100 }, () => rng2())

      expect(seq1).toEqual(seq2)
    })

    it('gera numeros entre 0 e 1', () => {
      const rng = createPRNG(12345)
      const values = Array.from({ length: 1000 }, () => rng())

      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    })

    it('gera sequencias diferentes para seeds diferentes', () => {
      const rng1 = createPRNG(1)
      const rng2 = createPRNG(2)

      const v1 = rng1()
      const v2 = rng2()

      expect(v1).not.toBe(v2)
    })
  })

  describe('gaussianRandom', () => {
    it('gera distribuicao com media proxima de 0', () => {
      const rng = createPRNG(42)
      const samples = Array.from({ length: 10000 }, () => gaussianRandom(rng))
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length

      expect(Math.abs(mean)).toBeLessThan(0.1)
    })

    it('gera distribuicao com desvio padrao proximo de 1', () => {
      const rng = createPRNG(42)
      const samples = Array.from({ length: 10000 }, () => gaussianRandom(rng))
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length
      const stddev = Math.sqrt(variance)

      expect(stddev).toBeGreaterThan(0.8)
      expect(stddev).toBeLessThan(1.2)
    })
  })

  describe('nextRegime', () => {
    it('retorna um regime valido', () => {
      const validRegimes: MarketRegime[] = ['BULL', 'BEAR', 'SIDEWAYS']
      const rng = createPRNG(42)

      for (let i = 0; i < 100; i++) {
        const result = nextRegime('BULL', rng)
        expect(validRegimes).toContain(result)
      }
    })

    it('transiciona entre regimes ao longo do tempo', () => {
      const rng = createPRNG(42)
      const regimes = new Set<MarketRegime>()
      let current: MarketRegime = 'BULL'

      for (let i = 0; i < 1000; i++) {
        current = nextRegime(current, rng)
        regimes.add(current)
      }

      // Apos 1000 transicoes, todos os 3 regimes devem ter aparecido
      expect(regimes.size).toBe(3)
    })
  })

  describe('generateGBMPath', () => {
    it('retorna array com S0 + steps elementos', () => {
      const rng = createPRNG(42)
      const path = generateGBMPath(100, 0.0015, 0.012, 1 / 252, 60, rng)

      // S0 + 60 steps = 61 elementos
      expect(path).toHaveLength(61)
    })

    it('primeiro elemento e o preco inicial (S0)', () => {
      const rng = createPRNG(42)
      const path = generateGBMPath(100, 0.0015, 0.012, 1 / 252, 60, rng)

      expect(path[0]).toBe(100)
    })

    it('todos os precos sao positivos (> 0)', () => {
      const rng = createPRNG(42)
      const path = generateGBMPath(100, 0.0015, 0.012, 1 / 252, 60, rng)

      for (const price of path) {
        expect(price).toBeGreaterThan(0)
      }
    })

    it('precos tem no maximo 2 casas decimais', () => {
      const rng = createPRNG(42)
      const path = generateGBMPath(100, 0.0015, 0.012, 1 / 252, 60, rng)

      for (const price of path) {
        const decimals = price.toString().split('.')[1]?.length ?? 0
        expect(decimals).toBeLessThanOrEqual(2)
      }
    })

    it('e deterministico (mesmo seed = mesmo resultado)', () => {
      const rng1 = createPRNG(42)
      const rng2 = createPRNG(42)

      const path1 = generateGBMPath(100, 0.0015, 0.012, 1 / 252, 60, rng1)
      const path2 = generateGBMPath(100, 0.0015, 0.012, 1 / 252, 60, rng2)

      expect(path1).toEqual(path2)
    })

    it('gera resultados com mu negativo (regime BEAR) sem precos negativos', () => {
      const rng = createPRNG(42)
      const path = generateGBMPath(5, -0.0012, 0.018, 1 / 252, 500, rng)

      for (const price of path) {
        expect(price).toBeGreaterThanOrEqual(0.01)
      }
    })
  })

  describe('generateCandlesForPeriod', () => {
    const endDate = new Date('2026-04-14T12:00:00Z')

    it.each([
      ['1H', 60],
      ['1D', 96],
      ['1S', 168],
      ['1M', 120],
    ] as const)('gera %s candles para periodo %s', (period, expectedCount) => {
      const candles = generateCandlesForPeriod('URU3', 120, 'A_TOP', period, endDate)
      expect(candles).toHaveLength(expectedCount)
    })

    it('todos os candles tem source = GBM', () => {
      const candles = generateCandlesForPeriod('URU3', 120, 'A_TOP', '1D', endDate)
      for (const candle of candles) {
        expect(candle.source).toBe('GBM')
      }
    })

    it('OHLC e valido: high >= max(open,close), low <= min(open,close)', () => {
      const candles = generateCandlesForPeriod('URU3', 120, 'A_TOP', '1D', endDate)

      for (const c of candles) {
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close))
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close))
        expect(c.high).toBeGreaterThanOrEqual(c.low)
      }
    })

    it('precos sao sempre positivos', () => {
      const candles = generateCandlesForPeriod('URU3', 120, 'A_TOP', '1M', endDate)

      for (const c of candles) {
        expect(c.open).toBeGreaterThan(0)
        expect(c.high).toBeGreaterThan(0)
        expect(c.low).toBeGreaterThan(0)
        expect(c.close).toBeGreaterThan(0)
      }
    })

    it('volumes sao positivos', () => {
      const candles = generateCandlesForPeriod('URU3', 120, 'A_TOP', '1D', endDate)

      for (const c of candles) {
        expect(c.volume).toBeGreaterThan(0)
      }
    })

    it('timestamps estao ordenados ASC', () => {
      const candles = generateCandlesForPeriod('URU3', 120, 'A_TOP', '1D', endDate)

      for (let i = 1; i < candles.length; i++) {
        expect(candles[i].timestamp.getTime()).toBeGreaterThan(candles[i - 1].timestamp.getTime())
      }
    })

    it('e deterministico para o mesmo ticker', () => {
      const candles1 = generateCandlesForPeriod('URU3', 120, 'A_TOP', '1D', endDate)
      const candles2 = generateCandlesForPeriod('URU3', 120, 'A_TOP', '1D', endDate)

      expect(candles1.map((c) => c.close)).toEqual(candles2.map((c) => c.close))
    })

    it('gera resultados diferentes para tickers diferentes', () => {
      const candles1 = generateCandlesForPeriod('URU3', 120, 'A_TOP', '1D', endDate)
      const candles2 = generateCandlesForPeriod('POR4', 110, 'A_TOP', '1D', endDate)

      // Pelo menos alguns closes devem ser diferentes
      const closes1 = candles1.map((c) => c.close)
      const closes2 = candles2.map((c) => c.close)
      expect(closes1).not.toEqual(closes2)
    })

    it('clusters B_ILLIQ tem volatilidade visivelmente maior que A_TOP', () => {
      const candlesTop = generateCandlesForPeriod('URU3', 100, 'A_TOP', '1M', endDate)
      const candlesIlliq = generateCandlesForPeriod('TIS3', 100, 'B_ILLIQ', '1M', endDate)

      // Calcular variancia dos retornos como proxy de volatilidade
      const returns = (candles: typeof candlesTop) =>
        candles.slice(1).map((c, i) => Math.abs(c.close - candles[i].close) / candles[i].close)

      const avgReturnTop = returns(candlesTop).reduce((a, b) => a + b, 0) / (candlesTop.length - 1)
      const avgReturnIlliq = returns(candlesIlliq).reduce((a, b) => a + b, 0) / (candlesIlliq.length - 1)

      // B_ILLIQ (volMultiplier=1.6) deve ter retornos medios maiores que A_TOP (0.8)
      expect(avgReturnIlliq).toBeGreaterThan(avgReturnTop)
    })
  })

  describe('generateAllPeriodsForAsset', () => {
    const endDate = new Date('2026-04-14T12:00:00Z')

    it('gera 444 candles no total (60+96+168+120)', () => {
      const result = generateAllPeriodsForAsset('URU3', 120, 'A_TOP', endDate)

      const total =
        result['1H'].length +
        result['1D'].length +
        result['1S'].length +
        result['1M'].length

      expect(total).toBe(444)
    })

    it('retorna os 4 periodos', () => {
      const result = generateAllPeriodsForAsset('URU3', 120, 'A_TOP', endDate)

      expect(result).toHaveProperty('1H')
      expect(result).toHaveProperty('1D')
      expect(result).toHaveProperty('1S')
      expect(result).toHaveProperty('1M')
    })

    it('cada periodo tem o numero correto de candles', () => {
      const result = generateAllPeriodsForAsset('URU3', 120, 'A_TOP', endDate)

      expect(result['1H']).toHaveLength(60)
      expect(result['1D']).toHaveLength(96)
      expect(result['1S']).toHaveLength(168)
      expect(result['1M']).toHaveLength(120)
    })
  })

  describe('constantes', () => {
    it('REGIME_PARAMS tem os valores corretos da TASK-025', () => {
      expect(REGIME_PARAMS.BULL.mu).toBe(0.0015)
      expect(REGIME_PARAMS.BULL.sigma).toBe(0.012)
      expect(REGIME_PARAMS.BEAR.mu).toBe(-0.0012)
      expect(REGIME_PARAMS.BEAR.sigma).toBe(0.018)
      expect(REGIME_PARAMS.SIDEWAYS.mu).toBe(0.0001)
      expect(REGIME_PARAMS.SIDEWAYS.sigma).toBe(0.008)
    })

    it('CANDLE_PERIODS tem as contagens corretas da TASK-025', () => {
      expect(CANDLE_PERIODS['1H'].count).toBe(60)
      expect(CANDLE_PERIODS['1D'].count).toBe(96)
      expect(CANDLE_PERIODS['1S'].count).toBe(168)
      expect(CANDLE_PERIODS['1M'].count).toBe(120)
    })

    it('CLUSTER_PARAMS cobre todos os 5 clusters', () => {
      const clusters: AssetCluster[] = ['A_TOP', 'A_MID', 'A_SMALL', 'B_LIQUID', 'B_ILLIQ']
      for (const c of clusters) {
        expect(CLUSTER_PARAMS[c]).toBeDefined()
        expect(CLUSTER_PARAMS[c].priceRange).toHaveLength(2)
        expect(CLUSTER_PARAMS[c].volMultiplier).toBeGreaterThan(0)
      }
    })
  })
})
