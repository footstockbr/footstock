import { BaseAgent, type AgentDecision, type MarketContext } from './BaseAgent'

/**
 * ContrarianAgent — vai contra a tendência (threshold mais alto que Momentum).
 * Vende em alta > 3% (sobrecomprado), compra em queda > 3% (subvalorizado).
 */
export class ContrarianAgent extends BaseAgent {
  constructor(weight = 1) {
    super('Contrarian', weight)
  }

  decide(ctx: MarketContext): AgentDecision {
    if (ctx.session === 'FECHADO') {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'market_closed' }
    }

    const priceModifier = this.randomGaussian(0, 0.0005)

    if (ctx.priceChange24h >= 0.03) {
      return { side: 'SELL', quantity: 5, priceModifier: Math.abs(priceModifier), reason: 'contrarian_overbought' }
    }

    if (ctx.priceChange24h <= -0.03) {
      return { side: 'BUY', quantity: 5, priceModifier: -Math.abs(priceModifier), reason: 'contrarian_oversold' }
    }

    return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'no_extreme' }
  }
}
