import { BaseAgent, type AgentDecision, type MarketContext } from './BaseAgent'

/**
 * PanicSellerAgent — ativa apenas em quedas > 5%.
 * Gera efeito de cascata de pânico com quantidade crescente à queda.
 */
export class PanicSellerAgent extends BaseAgent {
  constructor(weight = 1) {
    super('PanicSeller', weight)
  }

  decide(ctx: MarketContext): AgentDecision {
    if (ctx.session === 'CLOSED') {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'market_closed' }
    }

    if (ctx.priceChange24h >= -0.05) {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'no_panic' }
    }

    // Intensidade cresce com a queda — queda 10% → quantity × 2.
    // CAP em MAX_PANIC_QUANTITY: evita feedback loop em que
    // state.volume += syntheticVolume (MarketEngine:252) volta para ctx.volume24h
    // no proximo tick. Sem cap, quantity = vol*0.005 implicava vol cresce ~0.5%
    // por tick em ativos com queda persistente > 5%, estourando MAX_INT64 em
    // poucas horas (10 ativos foram para ~9e18 em prod).
    const MAX_PANIC_QUANTITY = 10_000
    let quantity = Math.ceil(ctx.volume24h * 0.005)
    if (ctx.priceChange24h <= -0.10) {
      quantity *= 2
    }
    quantity = Math.min(quantity, MAX_PANIC_QUANTITY)

    const decision: AgentDecision = {
      side: 'SELL',
      quantity,
      priceModifier: -0.003,
      reason: 'panic_cascade',
    }

    this.log('PanicSeller ativo', { agent: 'PanicSeller', reason: 'panic_cascade', quantity, priceChange: ctx.priceChange24h })

    return decision
  }
}
