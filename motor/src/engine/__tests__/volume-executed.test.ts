import { sumExecutedVolume } from '../MarketEngine'

/**
 * T2.1 — state.volume reflete fluxo EXECUTADO (fills casados), não book pendente.
 * Loop 06-17-motor-footstock-correcoes-variacoes / item 008.
 *
 * Antes do fix, o tick fazia
 *   state.volume += pendingBuyVolume + pendingSellVolume
 * o que inflava o volume 24h com book pendente que talvez nunca executasse.
 * Depois do fix, o tick faz
 *   state.volume += sumExecutedVolume(fills)
 * e expõe o book pendente separadamente em state.bookPressure.
 */
describe('T2.1 sumExecutedVolume', () => {
  it('retorna 0 para book vazio (nenhum fill casado)', () => {
    expect(sumExecutedVolume([])).toBe(0)
  })

  it('soma a quantidade executada de cada fill', () => {
    expect(sumExecutedVolume([{ quantity: 3 }, { quantity: 7 }, { quantity: 90 }])).toBe(100)
  })

  it('ignora a estrutura extra do fill, lê apenas quantity', () => {
    const fills = [
      { filledOrderId: 'o1', executedPrice: 10, quantity: 5 },
      { filledOrderId: 'o2', executedPrice: 11, quantity: 15 },
    ]
    expect(sumExecutedVolume(fills)).toBe(20)
  })
})

describe('T2.1 invariante de acumulação de volume (regra do tick)', () => {
  // Replica EXATAMENTE a regra aplicada em MarketEngine.tick():
  //   state.bookPressure = pendingBuyVolume + pendingSellVolume
  //   state.volume = min(state.volume + executedVolume, MAX_DAILY_VOLUME)
  const MAX_DAILY_VOLUME = 1_000_000_000_000_000

  function applyTickVolume(
    state: { volume: number; bookPressure?: number },
    pendingBuyVolume: number,
    pendingSellVolume: number,
    fills: ReadonlyArray<{ quantity: number }>,
  ): void {
    const executedVolume = sumExecutedVolume(fills)
    state.bookPressure = pendingBuyVolume + pendingSellVolume
    state.volume = Math.min(state.volume + executedVolume, MAX_DAILY_VOLUME)
  }

  it('500 ticks SEM fills com book mudando: state.volume NÃO cresce', () => {
    const state = { volume: 0, bookPressure: 0 }

    for (let tick = 0; tick < 500; tick++) {
      // Book pendente muda a cada tick (determinístico, sem RNG), mas NÃO há fills.
      const pendingBuyVolume = (tick * 37) % 1000
      const pendingSellVolume = (tick * 53) % 1000
      applyTickVolume(state, pendingBuyVolume, pendingSellVolume, [])

      // Book pressure acompanha o book pendente atual...
      expect(state.bookPressure).toBe(pendingBuyVolume + pendingSellVolume)
      // ...mas o volume executado permanece 0 ao longo de todos os 500 ticks.
      expect(state.volume).toBe(0)
    }

    expect(state.volume).toBe(0)
  })

  it('volume cresce SOMENTE quando há fills executados', () => {
    const state = { volume: 0, bookPressure: 0 }

    // Tick 1: book enorme, zero fills -> volume continua 0.
    applyTickVolume(state, 100_000, 100_000, [])
    expect(state.volume).toBe(0)
    expect(state.bookPressure).toBe(200_000)

    // Tick 2: 3 fills somando 250 -> volume passa a 250 (book não conta).
    applyTickVolume(state, 100_000, 100_000, [{ quantity: 100 }, { quantity: 100 }, { quantity: 50 }])
    expect(state.volume).toBe(250)
    expect(state.bookPressure).toBe(200_000)
  })

  it('clampa o volume acumulado em MAX_DAILY_VOLUME', () => {
    const state = { volume: MAX_DAILY_VOLUME - 10, bookPressure: 0 }
    applyTickVolume(state, 0, 0, [{ quantity: 1000 }])
    expect(state.volume).toBe(MAX_DAILY_VOLUME)
  })
})
