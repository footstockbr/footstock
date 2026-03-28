import { BaseAgent, type AgentDecision, type MarketContext } from './BaseAgent'

/**
 * MomentumAgent — segue a tendência de preço.
 * Compra em alta > 2%, vende em queda > 2%.
 */
export class MomentumAgent extends BaseAgent {
  constructor(weight = 1) {
    super('Momentum', weight)
  }

  decide(ctx: MarketContext): AgentDecision {
    if (ctx.session === 'FECHADO') {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'market_closed' }
    }

    const priceModifier = this.randomGaussian(0, 0.0005)

    if (ctx.priceChange24h > 0.02) {
      const intensity = Math.min(ctx.priceChange24h / 0.10, 1)
      const quantity = Math.max(1, Math.ceil(intensity * 10))
      return { side: 'BUY', quantity, priceModifier, reason: 'momentum_up' }
    }

    if (ctx.priceChange24h < -0.02) {
      const intensity = Math.min(Math.abs(ctx.priceChange24h) / 0.10, 1)
      const quantity = Math.max(1, Math.ceil(intensity * 10))
      return { side: 'SELL', quantity, priceModifier: -Math.abs(priceModifier), reason: 'momentum_down' }
    }

    return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'no_momentum' }
  }
}
