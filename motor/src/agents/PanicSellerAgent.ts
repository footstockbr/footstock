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
    if (ctx.session === 'FECHADO') {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'market_closed' }
    }

    if (ctx.priceChange24h >= -0.05) {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'no_panic' }
    }

    // Intensidade cresce com a queda — queda 10% → quantity × 2
    let quantity = Math.ceil(ctx.volume24h * 0.005)
    if (ctx.priceChange24h <= -0.10) {
      quantity *= 2
    }

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
