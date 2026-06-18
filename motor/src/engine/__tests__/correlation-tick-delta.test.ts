import { computeTickReturnDelta } from '../MarketEngine'

/**
 * T3.1 — previousTickDeltas usa o retorno TICK-A-TICK, não o retorno vs close diário.
 * Loop 06-17-motor-footstock-correcoes-variacoes / item 012.
 *
 * Antes do fix, o delta que alimenta L10_Correlation saía de
 *   (state.currentPrice - tick.close) / tick.close
 * onde tick.close é o CLOSE DIÁRIO (âncora do CB). Isso media o retorno diário,
 * não o retorno entre ticks, inflando a correlação inter-ativos por ordens de
 * grandeza. Depois do fix, o delta sai de
 *   (currentPrice - previousPrice) / previousPrice
 * onde previousPrice é o preço do ativo no TICK anterior (previousTickPrices),
 * e o primeiro tick após (re)start fica com delta 0 — nunca o close diário.
 */
describe('T3.1 computeTickReturnDelta (função pura)', () => {
  it('retorno tick-a-tick = (current - previous)/previous', () => {
    expect(computeTickReturnDelta(101, 100)).toBeCloseTo(0.01, 12)
    expect(computeTickReturnDelta(99, 100)).toBeCloseTo(-0.01, 12)
    expect(computeTickReturnDelta(100, 100)).toBe(0)
  })

  it('sem previousPrice (primeiro tick após restart) -> delta 0, não o close diário', () => {
    expect(computeTickReturnDelta(100, undefined)).toBe(0)
  })

  it('previousPrice/currentPrice não-positivos -> delta 0 (dado inicial tratável)', () => {
    expect(computeTickReturnDelta(100, 0)).toBe(0)
    expect(computeTickReturnDelta(100, -5)).toBe(0)
    expect(computeTickReturnDelta(0, 100)).toBe(0)
  })
})

describe('T3.1 previousTickDeltas == retorno real entre ticks (100 ticks)', () => {
  // Replica EXATAMENTE a regra do delta loop do MarketEngine.tick():
  //   const previousPrice = this.previousTickPrices.get(assetId)
  //   deltaPercent = computeTickReturnDelta(state.currentPrice, previousPrice)
  //   this.previousTickPrices.set(assetId, state.currentPrice)
  // O close diário NÃO entra na conta.
  const ASSET = 'A1'
  const DAILY_CLOSE = 50 // close diário fixo, deliberadamente DESALINHADO do path

  it('cada delta bate o retorno real entre ticks com erro <= 1e-9 e o close diário nunca substitui', () => {
    const previousTickPrices = new Map<string, number>()
    const prices: number[] = []
    let price = 100

    for (let t = 0; t < 100; t++) {
      // Path determinístico (sem RNG), oscila em torno de 100.
      price = price * (1 + Math.sin(t) * 0.003)
      prices.push(price)

      const previousPrice = previousTickPrices.get(ASSET)
      const delta = computeTickReturnDelta(price, previousPrice)

      if (t === 0) {
        // Primeiro tick: sem previousPrice -> delta 0, NÃO o retorno vs close diário.
        expect(delta).toBe(0)
        const deltaSeFosseClose = (price - DAILY_CLOSE) / DAILY_CLOSE
        expect(Math.abs(delta - deltaSeFosseClose)).toBeGreaterThan(1e-9)
      } else {
        const retornoReal = (prices[t] - prices[t - 1]) / prices[t - 1]
        expect(Math.abs(delta - retornoReal)).toBeLessThanOrEqual(1e-9)
        // E jamais o retorno contra o close diário.
        const deltaSeFosseClose = (price - DAILY_CLOSE) / DAILY_CLOSE
        expect(Math.abs(delta - deltaSeFosseClose)).toBeGreaterThan(1e-9)
      }

      previousTickPrices.set(ASSET, price)
    }

    expect(prices).toHaveLength(100)
  })

  it('restart limpa previousTickPrices -> o primeiro tick volta a delta 0 (não close diário)', () => {
    // Estado quente: já houve ticks, previousTickPrices populado.
    const previousTickPrices = new Map<string, number>()
    previousTickPrices.set(ASSET, 123.45)
    expect(computeTickReturnDelta(130, previousTickPrices.get(ASSET))).not.toBe(0)

    // Restart: nova base vazia (equivalente a stop() -> previousTickPrices.clear()).
    const afterRestart = new Map<string, number>()
    const deltaPrimeiroTick = computeTickReturnDelta(130, afterRestart.get(ASSET))
    expect(deltaPrimeiroTick).toBe(0)

    // E não é o retorno contra o close diário (que seria != 0).
    const deltaSeFosseClose = (130 - DAILY_CLOSE) / DAILY_CLOSE
    expect(Math.abs(deltaPrimeiroTick - deltaSeFosseClose)).toBeGreaterThan(1e-9)
  })
})
