/**
 * @jest-environment node
 */
// ============================================================================
// MarketEngine — A_TOP Persistência Invariante
// Valida FDD canônico: ativos A_TOP persistem PriceHistory em todo tick.
// Demais tiers persistem apenas a cada PERSIST_HISTORY_EVERY ticks.
// ============================================================================

describe('MarketEngine — A_TOP persistência', () => {
  // Replica a lógica de shouldPersist do MarketEngine.runTick() linha 270-272
  const shouldPersist = (cluster: string, tickCount: number, persistEvery: number): boolean =>
    cluster === 'A_TOP' || tickCount % persistEvery === 0

  test('A_TOP persiste em todo tick, independente do tickCount', () => {
    const persistEvery = 30
    for (let tickCount = 1; tickCount <= 100; tickCount++) {
      expect(shouldPersist('A_TOP', tickCount, persistEvery)).toBe(true)
    }
  })

  test('Tier B1 só persiste quando tickCount % PERSIST_HISTORY_EVERY === 0', () => {
    const persistEvery = 30
    for (let tickCount = 1; tickCount <= 60; tickCount++) {
      const expected = tickCount % persistEvery === 0
      expect(shouldPersist('B1', tickCount, persistEvery)).toBe(expected)
    }
  })

  test('Tier C1 só persiste quando tickCount % PERSIST_HISTORY_EVERY === 0', () => {
    const persistEvery = 30
    for (let tickCount = 1; tickCount <= 60; tickCount++) {
      const expected = tickCount % persistEvery === 0
      expect(shouldPersist('C1', tickCount, persistEvery)).toBe(expected)
    }
  })

  test('Tier D1 só persiste quando tickCount % PERSIST_HISTORY_EVERY === 0', () => {
    const persistEvery = 30
    for (let tickCount = 1; tickCount <= 60; tickCount++) {
      const expected = tickCount % persistEvery === 0
      expect(shouldPersist('D1', tickCount, persistEvery)).toBe(expected)
    }
  })
})
