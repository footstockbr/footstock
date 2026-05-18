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

    // Thresholds suavizados para apresentação: só dispara em queda > 10%, com
    // amplificação em > 15%. priceModifier reduzido de -0.003 para -0.001 para
    // evitar cascata durante demo.
    if (ctx.priceChange24h >= -0.10) {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'no_panic' }
    }

    const MAX_PANIC_QUANTITY = 10_000
    let quantity = Math.ceil(ctx.volume24h * 0.005)
    if (ctx.priceChange24h <= -0.15) {
      quantity *= 2
    }
    quantity = Math.min(quantity, MAX_PANIC_QUANTITY)

    const decision: AgentDecision = {
      side: 'SELL',
      quantity,
      priceModifier: -0.001,
      reason: 'panic_cascade',
    }

    this.log('PanicSeller ativo', { agent: 'PanicSeller', reason: 'panic_cascade', quantity, priceChange: ctx.priceChange24h })

    return decision
  }
}
