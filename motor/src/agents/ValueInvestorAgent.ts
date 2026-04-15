import { BaseAgent, type AgentDecision, type MarketContext } from './BaseAgent'

/**
 * ValueInvestorAgent — opera baseado em desconto/prêmio em relação ao fair value.
 * Opera apenas em TRADING e AFTER_MARKET.
 */
export class ValueInvestorAgent extends BaseAgent {
  constructor(weight = 1) {
    super('ValueInvestor', weight)
  }

  decide(ctx: MarketContext): AgentDecision {
    const allowedSessions = ['TRADING', 'AFTER_MARKET'] as const
    if (!allowedSessions.includes(ctx.session as 'TRADING' | 'AFTER_MARKET')) {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'session_not_allowed' }
    }

    if (ctx.currentPrice < ctx.fairValue * 0.95) {
      return { side: 'BUY', quantity: 2, priceModifier: 0.001, reason: 'undervalued' }
    }

    if (ctx.currentPrice > ctx.fairValue * 1.10) {
      return { side: 'SELL', quantity: 2, priceModifier: 0.001, reason: 'overvalued' }
    }

    return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'fair_value_range' }
  }
}
