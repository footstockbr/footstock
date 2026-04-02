// GBMHistoryGenerator — Gera dados históricos via Geometric Brownian Motion com regimes
// dS = mu*S*dt + sigma*S*dW (modelo de Black-Scholes)

export type MarketRegime = 'BULL' | 'BEAR' | 'SIDEWAYS'

export interface OHLCBar {
  date: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  regime: MarketRegime
}

interface RegimeParams {
  mu: number    // drift anual
  sigma: number // volatilidade anual
}

const REGIME_PARAMS: Record<MarketRegime, RegimeParams> = {
  BULL:     { mu: 0.15,  sigma: 0.20 },
  BEAR:     { mu: -0.10, sigma: 0.30 },
  SIDEWAYS: { mu: 0.02,  sigma: 0.15 },
}

// Probabilidade de transição de regime por dia
const REGIME_TRANSITION_PROB = 0.05

/** Gera número aleatório gaussiano (Box-Muller) */
function gaussianRandom(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

/** Escolhe próximo regime via cadeia de Markov */
function nextRegime(current: MarketRegime): MarketRegime {
  if (Math.random() > REGIME_TRANSITION_PROB) return current
  const regimes: MarketRegime[] = ['BULL', 'BEAR', 'SIDEWAYS']
  const others = regimes.filter((r) => r !== current)
  return others[Math.floor(Math.random() * others.length)]!
}

export class GBMHistoryGenerator {
  /**
   * Gera N dias de dados OHLC para um ativo
   * @param ticker símbolo do ativo
   * @param startPrice preço IPO inicial
   * @param days número de dias (padrão 365)
   * @param startDate data de início (padrão: 365 dias atrás)
   */
  generate(params: {
    ticker: string
    startPrice: number
    days?: number
    startDate?: Date
  }): OHLCBar[] {
    const { startPrice, days = 365 } = params
    const dt = 1 / 252 // fração de ano por dia útil
    const bars: OHLCBar[] = []

    let price = startPrice
    let regime: MarketRegime = 'BULL'
    const start = params.startDate ?? new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    for (let i = 0; i < days; i++) {
      regime = nextRegime(regime)
      const { mu, sigma } = REGIME_PARAMS[regime]

      // Simular intraday com 8 ticks para OHLC
      const intradayPrices = [price]
      for (let t = 0; t < 8; t++) {
        const drift = (mu - 0.5 * sigma * sigma) * dt / 8
        const diffusion = sigma * Math.sqrt(dt / 8) * gaussianRandom()
        intradayPrices.push(intradayPrices[t]! * Math.exp(drift + diffusion))
      }

      const open = intradayPrices[0]!
      const close = intradayPrices[intradayPrices.length - 1]!
      const high = Math.max(...intradayPrices)
      const low = Math.min(...intradayPrices)

      // Volume log-normal: média 100k, desvio padrão alto
      const volumeMean = 100_000
      const volumeSigma = 0.8
      const volume = Math.round(volumeMean * Math.exp(volumeSigma * gaussianRandom()))

      const date = new Date(start)
      date.setDate(date.getDate() + i)

      bars.push({ date, open, high, low, close, volume, regime })
      price = close
    }

    return bars
  }
}
