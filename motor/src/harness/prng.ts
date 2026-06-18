// ============================================================================
// FootStock Motor — Harness de medicao (Item 003 / loop 06-17)
//
// PRNG deterministico (mulberry32) + injecao via override de Math.random.
//
// ZERO TOQUE EM CODIGO DE PRODUCAO: o motor (MarketEngine, agentes, layers)
// consome aleatoriedade exclusivamente por `Math.random()`. Para reprodutibilidade
// o harness substitui `Math.random` por um gerador semeado APENAS durante a
// medicao e restaura o original ao final. Nenhum arquivo do motor e alterado.
//
// Reversao: remover o diretorio `src/harness/` inteiro.
// ============================================================================

/** Gerador mulberry32: rapido, deterministico, 32-bit. Retorna [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Handle para restaurar Math.random ao estado original. */
export interface SeededRandomHandle {
  /** Restaura o `Math.random` nativo. Idempotente. */
  restore(): void
}

/**
 * Substitui `Math.random` por um gerador semeado. Retorna handle de restauracao.
 * Use sempre dentro de try/finally para garantir o restore mesmo em erro.
 */
export function installSeededRandom(seed: number): SeededRandomHandle {
  const original = Math.random
  const next = mulberry32(seed)
  Math.random = next
  let restored = false
  return {
    restore(): void {
      if (restored) return
      Math.random = original
      restored = true
    },
  }
}
