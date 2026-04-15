// GBMHistoryGenerator — Gera dados historicos via Geometric Brownian Motion com regimes
// dS = mu*S*dt + sigma*S*dW (modelo de Black-Scholes)
//
// TASK-025: Atualizado para seed deterministico, transicoes Markov com probabilidades,
// e calibragem por cluster.

export type MarketRegime = 'BULL' | 'BEAR' | 'SIDEWAYS'
export type AssetCluster = 'A_TOP' | 'A_MID' | 'A_SMALL' | 'B_LIQUID' | 'B_ILLIQ'

export interface OHLCBar {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  regime: MarketRegime
  source: 'GBM' | 'REAL'
}

interface RegimeParams {
  mu: number    // drift por candle
  sigma: number // volatilidade por candle
}

const REGIME_PARAMS: Record<MarketRegime, RegimeParams> = {
  BULL:     { mu: 0.0015,  sigma: 0.012 },
  BEAR:     { mu: -0.0012, sigma: 0.018 },
  SIDEWAYS: { mu: 0.0001,  sigma: 0.008 },
}

/** Matriz de transicao de regime (cadeia de Markov) */
const REGIME_TRANSITIONS: Record<MarketRegime, Record<MarketRegime, number>> = {
  BULL:     { BULL: 0.60, SIDEWAYS: 0.30, BEAR: 0.10 },
  BEAR:     { BEAR: 0.55, SIDEWAYS: 0.30, BULL: 0.15 },
  SIDEWAYS: { SIDEWAYS: 0.50, BULL: 0.30, BEAR: 0.20 },
}

const CLUSTER_VOL_MULTIPLIER: Record<AssetCluster, number> = {
  A_TOP: 0.8,
  A_MID: 1.0,
  A_SMALL: 1.2,
  B_LIQUID: 1.3,
  B_ILLIQ: 1.6,
}

// ─── PRNG deterministico (Mulberry32) ─────────────────────────────────────────

function hashString(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash
}

function createPRNG(seed: number): () => number {
  let state = seed >>> 0
  return function mulberry32(): number {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Gera numero aleatorio gaussiano (Box-Muller) com PRNG deterministico */
function gaussianRandom(rng: () => number): number {
  let u = 0, v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

/** Escolhe proximo regime via cadeia de Markov */
function nextRegime(current: MarketRegime, rng: () => number): MarketRegime {
  const transitions = REGIME_TRANSITIONS[current]
  const roll = rng()
  let cumulative = 0
  for (const [regime, prob] of Object.entries(transitions)) {
    cumulative += prob
    if (roll < cumulative) return regime as MarketRegime
  }
  return current
}

export class GBMHistoryGenerator {
  /**
   * Gera N dias de dados OHLC para um ativo
   * @param ticker simbolo do ativo (usado como seed deterministico)
   * @param startPrice preco IPO inicial
   * @param cluster cluster do ativo (afeta volatilidade)
   * @param days numero de dias (padrao 365)
   * @param startDate data de inicio (padrao: 365 dias atras)
   */
  generate(params: {
    ticker: string
    startPrice: number
    cluster?: AssetCluster
    days?: number
    startDate?: Date
  }): OHLCBar[] {
    const { ticker, startPrice, cluster = 'A_MID', days = 365 } = params
    const dt = 1 / 252 // fracao de ano por dia util
    const bars: OHLCBar[] = []
    const volMultiplier = CLUSTER_VOL_MULTIPLIER[cluster]

    // Seed deterministico por ticker
    const rng = createPRNG(hashString(ticker))

    let price = startPrice
    let regime: MarketRegime = 'SIDEWAYS'
    const start = params.startDate ?? new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    for (let i = 0; i < days; i++) {
      regime = nextRegime(regime, rng)
      const { mu, sigma } = REGIME_PARAMS[regime]
      const adjustedSigma = sigma * volMultiplier

      // Simular intraday com 8 ticks para OHLC
      const intradayPrices = [price]
      for (let t = 0; t < 8; t++) {
        const drift = (mu - 0.5 * adjustedSigma * adjustedSigma) * dt / 8
        const diffusion = adjustedSigma * Math.sqrt(dt / 8) * gaussianRandom(rng)
        const newPrice = Math.max(0.01, intradayPrices[t]! * Math.exp(drift + diffusion))
        intradayPrices.push(Math.round(newPrice * 100) / 100)
      }

      const open = intradayPrices[0]!
      const close = intradayPrices[intradayPrices.length - 1]!
      const high = Math.round(Math.max(...intradayPrices) * 100) / 100
      const low = Math.round(Math.min(...intradayPrices) * 100) / 100

      // Volume log-normal
      const volumeMean = 100_000
      const volumeSigma = 0.8
      const volume = Math.max(1, Math.round(volumeMean * Math.exp(volumeSigma * gaussianRandom(rng))))

      const date = new Date(start)
      date.setDate(date.getDate() + i)

      bars.push({ date, open, high, low, close, volume, regime, source: 'GBM' })
      price = close
    }

    return bars
  }
}
