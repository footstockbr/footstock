import { BaseAgent, type AgentDecision, type MarketContext } from './BaseAgent'

/**
 * MarketMakerAgent — mantém spread e fornece liquidez dos dois lados.
 * Opera em todas as sessões exceto FECHADO.
 */
export class MarketMakerAgent extends BaseAgent {
  private lastSide: 'BUY' | 'SELL' = 'BUY'

  constructor(weight = 1) {
    super('MarketMaker', weight)
  }

  decide(ctx: MarketContext): AgentDecision {
    if (ctx.session === 'FECHADO') {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'market_closed' }
    }

    const TARGET_SPREAD = 0.001
    if (ctx.spread < TARGET_SPREAD) {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'spread_tight' }
    }

    // Alternar lados para comprimir o spread
    const side = this.lastSide === 'BUY' ? 'SELL' : 'BUY'
    this.lastSide = side

    const quantity = Math.max(1, Math.floor(ctx.volume24h * 0.001))
    const priceModifier = side === 'BUY' ? -0.001 : 0.001

    return { side, quantity, priceModifier, reason: 'compress_spread' }
  }
}
