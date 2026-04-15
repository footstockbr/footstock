/**
 * GBMGenerator — Geometric Brownian Motion com seed deterministico
 *
 * Gera caminhos de preco sinteticos para pre-popular graficos de ativos
 * que ainda nao possuem historico real. Cada ativo recebe seed fixo
 * (hash do ticker), garantindo reproducibilidade entre redeploys.
 *
 * Formula: dS = S * (mu * dt + sigma * sqrt(dt) * Z), Z ~ N(0,1)
 *
 * Referencia: TASK-025 (Historico de Graficos via GBM)
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type MarketRegime = 'BULL' | 'BEAR' | 'SIDEWAYS'

export type AssetCluster = 'A_TOP' | 'A_MID' | 'A_SMALL' | 'B_LIQUID' | 'B_ILLIQ'

export interface GBMConfig {
  /** Preco inicial (S0) */
  startPrice: number
  /** Drift por candle */
  mu: number
  /** Volatilidade por candle */
  sigma: number
  /** Fracao de tempo por step */
  dt: number
  /** Quantidade de steps */
  steps: number
}

export interface RegimeParams {
  mu: number
  sigma: number
}

export interface ClusterParams {
  /** Faixa de preco inicial [min, max] */
  priceRange: [number, number]
  /** Multiplicador de volatilidade */
  volMultiplier: number
  /** Media de volume sintetico */
  volumeMean: number
  /** Desvio padrao do volume (log-normal) */
  volumeSigma: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Parametros de regime conforme TASK-025 */
export const REGIME_PARAMS: Record<MarketRegime, RegimeParams> = {
  BULL:     { mu: 0.0015,  sigma: 0.012 },
  BEAR:     { mu: -0.0012, sigma: 0.018 },
  SIDEWAYS: { mu: 0.0001,  sigma: 0.008 },
}

/** Matriz de transicao de regime (Markov) */
export const REGIME_TRANSITIONS: Record<MarketRegime, Record<MarketRegime, number>> = {
  BULL: {
    BULL: 0.60,
    SIDEWAYS: 0.30,
    BEAR: 0.10,
  },
  BEAR: {
    BEAR: 0.55,
    SIDEWAYS: 0.30,
    BULL: 0.15,
  },
  SIDEWAYS: {
    SIDEWAYS: 0.50,
    BULL: 0.30,
    BEAR: 0.20,
  },
}

/** Calibragem por cluster de ativo */
export const CLUSTER_PARAMS: Record<AssetCluster, ClusterParams> = {
  A_TOP:    { priceRange: [90, 120],  volMultiplier: 0.8,  volumeMean: 150_000, volumeSigma: 0.6 },
  A_MID:    { priceRange: [50, 80],   volMultiplier: 1.0,  volumeMean: 100_000, volumeSigma: 0.7 },
  A_SMALL:  { priceRange: [12, 40],   volMultiplier: 1.2,  volumeMean: 60_000,  volumeSigma: 0.8 },
  B_LIQUID: { priceRange: [7, 13],    volMultiplier: 1.3,  volumeMean: 40_000,  volumeSigma: 0.9 },
  B_ILLIQ:  { priceRange: [4, 8],     volMultiplier: 1.6,  volumeMean: 15_000,  volumeSigma: 1.0 },
}

/** Periodos de candle conforme TASK-025 */
export const CANDLE_PERIODS = {
  '1H': { intervalMs: 60 * 1000,          count: 60,  ticksPerCandle: 10, label: '1 minuto' },
  '1D': { intervalMs: 15 * 60 * 1000,     count: 96,  ticksPerCandle: 15, label: '15 minutos' },
  '1S': { intervalMs: 60 * 60 * 1000,     count: 168, ticksPerCandle: 20, label: '1 hora' },
  '1M': { intervalMs: 6 * 60 * 60 * 1000, count: 120, ticksPerCandle: 24, label: '6 horas' },
} as const

export type CandlePeriod = keyof typeof CANDLE_PERIODS

// ─── PRNG deterministico (Mulberry32) ─────────────────────────────────────────

/** Hash simples de string para uint32 (djb2) */
export function hashTicker(ticker: string): number {
  let hash = 5381
  for (let i = 0; i < ticker.length; i++) {
    hash = ((hash << 5) + hash + ticker.charCodeAt(i)) >>> 0
  }
  return hash
}

/** PRNG Mulberry32 — deterministico a partir de seed uint32 */
export function createPRNG(seed: number): () => number {
  let state = seed >>> 0
  return function mulberry32(): number {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Gaussiana via Box-Muller com PRNG deterministico */
export function gaussianRandom(rng: () => number): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

// ─── Regime Switching ─────────────────────────────────────────────────────────

/** Escolhe proximo regime usando cadeia de Markov e PRNG deterministico */
export function nextRegime(current: MarketRegime, rng: () => number): MarketRegime {
  const transitions = REGIME_TRANSITIONS[current]
  const roll = rng()
  let cumulative = 0
  for (const [regime, prob] of Object.entries(transitions)) {
    cumulative += prob
    if (roll < cumulative) return regime as MarketRegime
  }
  return current
}

// ─── Gerador de caminho GBM ──────────────────────────────────────────────────

/**
 * Gera caminho de precos via GBM
 * @returns Array de precos positivos com 2 casas decimais
 */
export function generateGBMPath(
  S0: number,
  mu: number,
  sigma: number,
  dt: number,
  steps: number,
  rng: () => number
): number[] {
  const prices: number[] = [Math.round(S0 * 100) / 100]

  for (let i = 1; i <= steps; i++) {
    const prevPrice = prices[i - 1]
    const drift = (mu - 0.5 * sigma * sigma) * dt
    const diffusion = sigma * Math.sqrt(dt) * gaussianRandom(rng)
    const newPrice = prevPrice * Math.exp(drift + diffusion)
    // Guard: preco nunca negativo, minimo FS$ 0.01
    prices.push(Math.round(Math.max(0.01, newPrice) * 100) / 100)
  }

  return prices
}

// ─── Tipos de saida ──────────────────────────────────────────────────────────

export interface GBMCandle {
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  regime: MarketRegime
  source: 'GBM'
}

// ─── Gerador principal ───────────────────────────────────────────────────────

/**
 * Gera candles OHLC para um periodo especifico de um ativo.
 *
 * @param ticker - Simbolo do ativo (usado como seed)
 * @param startPrice - Preco de partida (fairValue do ativo)
 * @param cluster - Cluster do ativo (afeta volatilidade e volume)
 * @param period - Periodo de candle (1H, 1D, 1S, 1M)
 * @param endDate - Data final dos candles (default: agora)
 * @returns Array de GBMCandle ordenado por timestamp ASC
 */
export function generateCandlesForPeriod(
  ticker: string,
  startPrice: number,
  cluster: AssetCluster,
  period: CandlePeriod,
  endDate: Date = new Date()
): GBMCandle[] {
  const config = CANDLE_PERIODS[period]
  const clusterConfig = CLUSTER_PARAMS[cluster]

  // Seed deterministico: hash do ticker + hash do periodo
  const baseSeed = hashTicker(ticker)
  const periodSeed = hashTicker(period)
  const rng = createPRNG((baseSeed ^ periodSeed) >>> 0)

  const candles: GBMCandle[] = []
  let currentPrice = startPrice
  let regime: MarketRegime = 'SIDEWAYS'

  // Timestamps: de (endDate - count * interval) ate endDate
  const startTime = endDate.getTime() - config.count * config.intervalMs

  for (let i = 0; i < config.count; i++) {
    // Transicao de regime a cada candle
    regime = nextRegime(regime, rng)
    const { mu, sigma } = REGIME_PARAMS[regime]

    // Aplicar multiplicador de volatilidade do cluster
    const adjustedSigma = sigma * clusterConfig.volMultiplier

    // Gerar ticks intracandle para derivar OHLC
    const ticks = generateGBMPath(
      currentPrice,
      mu,
      adjustedSigma,
      1.0 / config.ticksPerCandle,
      config.ticksPerCandle,
      rng
    )

    const open = ticks[0]
    const close = ticks[ticks.length - 1]
    const high = Math.round(Math.max(...ticks) * 100) / 100
    const low = Math.round(Math.min(...ticks) * 100) / 100

    // Volume sintetico log-normal baseado no cluster
    const rawVolume = clusterConfig.volumeMean * Math.exp(clusterConfig.volumeSigma * gaussianRandom(rng))
    const volume = Math.max(1, Math.round(rawVolume))

    const timestamp = new Date(startTime + i * config.intervalMs)

    candles.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      regime,
      source: 'GBM',
    })

    currentPrice = close
  }

  return candles
}

/**
 * Gera todos os candles GBM para um ativo (todos os 4 periodos).
 * Total: 60 + 96 + 168 + 120 = 444 candles por ativo.
 *
 * O preco de partida de cada periodo e calibrado independentemente
 * a partir do fairValue do ativo, garantindo coerencia visual.
 */
export function generateAllPeriodsForAsset(
  ticker: string,
  fairValue: number,
  cluster: AssetCluster,
  endDate: Date = new Date()
): Record<CandlePeriod, GBMCandle[]> {
  return {
    '1H': generateCandlesForPeriod(ticker, fairValue, cluster, '1H', endDate),
    '1D': generateCandlesForPeriod(ticker, fairValue, cluster, '1D', endDate),
    '1S': generateCandlesForPeriod(ticker, fairValue, cluster, '1S', endDate),
    '1M': generateCandlesForPeriod(ticker, fairValue, cluster, '1M', endDate),
  }
}
