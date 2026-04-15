import { BaseAgent, type AgentDecision, type MarketContext } from './BaseAgent'

/**
 * RandomTraderAgent — toma decisões aleatórias com distribuição 30/30/40.
 * Opera em todas as sessões exceto CLOSED.
 */
export class RandomTraderAgent extends BaseAgent {
  constructor(weight = 1) {
    super('RandomTrader', weight)
  }

  decide(ctx: MarketContext): AgentDecision {
    if (ctx.session === 'CLOSED') {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'market_closed' }
    }

    const roll = Math.random()
    const quantity = Math.ceil(Math.random() * 5)  // 1 a 5

    if (roll < 0.30) {
      return { side: 'BUY', quantity, priceModifier: this.randomGaussian(0, 0.0003), reason: 'random_buy' }
    }
    if (roll < 0.60) {
      return { side: 'SELL', quantity, priceModifier: this.randomGaussian(0, 0.0003), reason: 'random_sell' }
    }

    return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'random_hold' }
  }
}
