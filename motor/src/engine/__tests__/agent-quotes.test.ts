/**
 * @jest-environment node
 *
 * Item T1.1 (loop 06-17) — hardening da auditoria adversarial.
 *
 * Cobre o caminho de PRODUCAO `ctx.spread = (ask-bid)/mid` do OrderBook real e
 * TODOS os fallbacks (book vazio/unilateral/cruzado/igual/mid<=0) diretamente
 * sobre a funcao pura `deriveAgentQuotes` — SEM o toggle `legacySpreadUnit` do
 * harness, que so reproduzia o bug e nunca exercitava o caminho real-book.
 *
 * Tambem liga a saida do helper no `MarketMakerAgent.decide` real para provar,
 * fim-a-fim e na unidade certa, o gate de spread fracional (HOLD em book
 * estreito, dispara em book largo) — a ressalva central da review do item 004.
 */
import { deriveAgentQuotes } from '../agent-quotes'
import { MarketMakerAgent } from '../../agents/MarketMakerAgent'
import type { MarketContext } from '../../agents/BaseAgent'

// TARGET_SPREAD do MarketMakerAgent (fracional). Mantido em sincronia com o agente.
const TARGET_SPREAD = 0.001

// Spreads base por cluster (fracionais), de src/microstructure/clusters.ts.
const A_TOP_SPREAD = 0.0005
const B_ILLIQ_SPREAD = 0.015

function ctxFromQuotes(q: { bid: number; ask: number; spread: number }): MarketContext {
  return {
    ticker: 'TST3',
    currentPrice: 100,
    fairValue: 100,
    priceChange24h: 0,
    volume24h: 1_000_000,
    baseVolume: 20_000,
    bid: q.bid,
    ask: q.ask,
    spread: q.spread,
    session: 'TRADING',
    volatilityMultiplier: 1,
  }
}

describe('deriveAgentQuotes — caminho real-book (ask-bid)/mid', () => {
  it('book bilateral valido usa bid/ask reais e spread FRACIONAL (ask-bid)/mid', () => {
    const q = deriveAgentQuotes(99.5, 100.5, 100, A_TOP_SPREAD)
    expect(q.bid).toBe(99.5)
    expect(q.ask).toBe(100.5)
    // mid = 100 -> (100.5-99.5)/100 = 0.01
    expect(q.spread).toBeCloseTo(0.01, 10)
  })

  it('spread sai na MESMA unidade de TARGET_SPREAD (fracional, nao absoluto)', () => {
    // book com 0,1% de largura -> spread fracional == 0.001 == TARGET_SPREAD
    const q = deriveAgentQuotes(99.95, 100.05, 100, A_TOP_SPREAD)
    expect(q.spread).toBeCloseTo(0.001, 10)
    // sanity anti-regressao: NAO e o valor absoluto antigo (price*0.002 = 0.2)
    expect(q.spread).toBeLessThan(0.01)
  })

  it('ignora referencePrice/baseSpread quando o book real e valido', () => {
    const q = deriveAgentQuotes(10, 11, 999, 0.5)
    expect(q.bid).toBe(10)
    expect(q.ask).toBe(11)
    expect(q.spread).toBeCloseTo(1 / 10.5, 10) // mid = 10.5
  })
})

describe('deriveAgentQuotes — fallbacks (book ausente/invalido)', () => {
  const expectFallback = (q: { bid: number; ask: number; spread: number }, ref: number, base: number) => {
    expect(q.spread).toBe(base)
    expect(q.bid).toBeCloseTo(ref * (1 - base / 2), 10)
    expect(q.ask).toBeCloseTo(ref * (1 + base / 2), 10)
  }

  it('book vazio (null, null) -> fallback params.spread + quotes sinteticas', () => {
    expectFallback(deriveAgentQuotes(null, null, 100, A_TOP_SPREAD), 100, A_TOP_SPREAD)
  })

  it('unilateral (bid null) -> fallback', () => {
    expectFallback(deriveAgentQuotes(null, 100.5, 100, A_TOP_SPREAD), 100, A_TOP_SPREAD)
  })

  it('unilateral (ask null) -> fallback', () => {
    expectFallback(deriveAgentQuotes(99.5, null, 100, A_TOP_SPREAD), 100, A_TOP_SPREAD)
  })

  it('book cruzado (bestAsk < bestBid) -> fallback', () => {
    expectFallback(deriveAgentQuotes(101, 100, 100, A_TOP_SPREAD), 100, A_TOP_SPREAD)
  })

  it('book degenerado (bestAsk == bestBid) -> fallback (precisa de ask > bid)', () => {
    expectFallback(deriveAgentQuotes(100, 100, 100, A_TOP_SPREAD), 100, A_TOP_SPREAD)
  })

  it('mid <= 0 (precos nao-positivos) -> spread base, mas preserva bid/ask reais', () => {
    const q = deriveAgentQuotes(-2, -1, 100, A_TOP_SPREAD)
    expect(q.bid).toBe(-2)
    expect(q.ask).toBe(-1)
    expect(q.spread).toBe(A_TOP_SPREAD) // guard mid>0 evita spread negativo
  })
})

describe('integracao real-book -> MarketMakerAgent.decide (gate de spread fracional)', () => {
  it('book ESTREITO real (spread fracional < TARGET) -> MM faz HOLD (spread_tight)', () => {
    const mm = new MarketMakerAgent()
    // largura 0,04% -> spread 0.0004 < TARGET_SPREAD 0.001
    const q = deriveAgentQuotes(99.98, 100.02, 100, A_TOP_SPREAD)
    expect(q.spread).toBeLessThan(TARGET_SPREAD)
    const d = mm.decide(ctxFromQuotes(q))
    expect(d.side).toBe('HOLD')
    expect(d.reason).toBe('spread_tight')
  })

  it('book LARGO real (spread fracional > TARGET) -> MM dispara (compress_spread)', () => {
    const mm = new MarketMakerAgent()
    // largura 3% -> spread 0.03 >> TARGET_SPREAD
    const q = deriveAgentQuotes(98.5, 101.5, 100, B_ILLIQ_SPREAD)
    expect(q.spread).toBeGreaterThan(TARGET_SPREAD)
    const d = mm.decide(ctxFromQuotes(q))
    expect(d.side === 'BUY' || d.side === 'SELL').toBe(true)
    expect(d.reason).toBe('compress_spread')
  })

  it('book nominal de 0,1% (spread fracional float logo ABAIXO de TARGET) -> HOLD', () => {
    // Documenta a borda: (100.05-99.95)/100 = 0.0009999...432 (float) < 0.001,
    // entao a comparacao estrita `ctx.spread < TARGET_SPREAD` trata como apertado.
    const mm = new MarketMakerAgent()
    const q = deriveAgentQuotes(99.95, 100.05, 100, A_TOP_SPREAD)
    expect(q.spread).toBeLessThan(TARGET_SPREAD)
    expect(mm.decide(ctxFromQuotes(q)).reason).toBe('spread_tight')
  })

  it('book logo ACIMA do limiar (0,2% -> spread 0.002 > TARGET) -> MM dispara', () => {
    const mm = new MarketMakerAgent()
    const q = deriveAgentQuotes(99.9, 100.1, 100, A_TOP_SPREAD) // spread ~0.002
    expect(q.spread).toBeGreaterThan(TARGET_SPREAD)
    expect(mm.decide(ctxFromQuotes(q)).reason).toBe('compress_spread')
  })

  it('book ausente em ativo de cluster largo (B_ILLIQ) -> fallback ainda dispara o MM', () => {
    const mm = new MarketMakerAgent()
    const q = deriveAgentQuotes(null, null, 100, B_ILLIQ_SPREAD) // spread = 0.015 > TARGET
    const d = mm.decide(ctxFromQuotes(q))
    expect(d.reason).toBe('compress_spread')
  })
})
