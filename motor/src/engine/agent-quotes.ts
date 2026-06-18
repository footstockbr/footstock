// ============================================================================
// FootStock Motor — Derivacao de quotes (bid/ask/spread) para os agentes
// Item T1.1 (loop 06-17-motor-footstock-correcoes-variacoes).
//
// Extraido do laco de tick do MarketEngine para ser PURO e testavel em
// isolamento (cobre o caminho de producao real-book `(ask-bid)/mid` e os
// fallbacks de book vazio/unilateral/cruzado/mid<=0 sem precisar rodar um tick
// inteiro nem usar o toggle `legacySpreadUnit` do harness).
//
// O `spread` retornado e FRACIONAL — a MESMA unidade do `TARGET_SPREAD` do
// MarketMakerAgent. ANTES do T1.1, o engine passava `spread = price*0.002`
// (ABSOLUTO) comparado contra `TARGET_SPREAD = 0.001` (fracao): o mismatch de
// unidade fazia o MarketMaker disparar em todo tick. Esta funcao corrige a
// origem (book real) e a unidade (fracional) sem tocar na formula de impacto.
// ============================================================================

export interface AgentQuotes {
  /** Melhor bid (book real quando bilateral valido; senao quote sintetica). */
  bid: number
  /** Melhor ask (book real quando bilateral valido; senao quote sintetica). */
  ask: number
  /** Spread FRACIONAL `(ask-bid)/mid` (mesma unidade de TARGET_SPREAD). */
  spread: number
}

/**
 * Deriva `{ bid, ask, spread }` para o `MarketContext` dos agentes.
 *
 * Caminho real-book: quando ha `bestBid` e `bestAsk` formando um book bilateral
 * valido (`bestAsk > bestBid`) com `mid > 0`, usa os precos reais e o spread
 * fracional `(bestAsk - bestBid) / mid`.
 *
 * Fallback (book vazio, unilateral, cruzado/igual, ou `mid <= 0`): usa
 * `baseSpread` do cluster (ja fracional) e quotes sinteticas centradas em
 * `referencePrice`.
 *
 * @param bestBid melhor bid do OrderBook (`null` se ausente)
 * @param bestAsk melhor ask do OrderBook (`null` se ausente)
 * @param referencePrice preco de referencia para as quotes sinteticas do fallback
 * @param baseSpread spread base do cluster (fracional), usado no fallback
 */
export function deriveAgentQuotes(
  bestBid: number | null,
  bestAsk: number | null,
  referencePrice: number,
  baseSpread: number,
): AgentQuotes {
  if (bestBid !== null && bestAsk !== null && bestAsk > bestBid) {
    const mid = (bestAsk + bestBid) / 2
    if (mid > 0) {
      return { bid: bestBid, ask: bestAsk, spread: (bestAsk - bestBid) / mid }
    }
    // book bilateral mas mid<=0 (precos nao-positivos): cai no spread base,
    // preservando os precos reais do book para bid/ask.
    return { bid: bestBid, ask: bestAsk, spread: baseSpread }
  }
  return {
    bid: referencePrice * (1 - baseSpread / 2),
    ask: referencePrice * (1 + baseSpread / 2),
    spread: baseSpread,
  }
}
