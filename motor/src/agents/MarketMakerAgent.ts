import { BaseAgent, type AgentDecision, type MarketContext } from './BaseAgent'

/**
 * MarketMakerAgent — mantém spread e fornece liquidez dos dois lados.
 * Opera em todas as sessões exceto CLOSED.
 */
export class MarketMakerAgent extends BaseAgent {
  private lastSide: 'BUY' | 'SELL' = 'BUY'

  constructor(weight = 1) {
    super('MarketMaker', weight)
  }

  decide(ctx: MarketContext): AgentDecision {
    if (ctx.session === 'CLOSED') {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'market_closed' }
    }

    // TARGET_SPREAD é FRACIONAL. ctx.spread chega como (ask-bid)/mid do book real
    // (fallback params.spread do cluster), na MESMA unidade — vide MarketEngine
    // (Item T1.1). Só fornece liquidez quando o spread fracional excede o alvo;
    // abaixo disso o book já está apertado o suficiente.
    const TARGET_SPREAD = 0.001
    if (ctx.spread < TARGET_SPREAD) {
      return { side: 'HOLD', quantity: 0, priceModifier: 0, reason: 'spread_tight' }
    }

    // Alternar lados para comprimir o spread
    const side = this.lastSide === 'BUY' ? 'SELL' : 'BUY'
    this.lastSide = side

    // Item T2.2: quantity dimensionada pela PROFUNDIDADE do book (ctx.baseVolume,
    // fixo por cluster) e NÃO por ctx.volume24h (= state.volume, volume executado).
    // Isso quebra o feedback loop linear que existia quando syntheticVolume voltava
    // para state.volume e realimentava a quantity no tick seguinte. Com state.volume
    // zerado a quantity permanece finita e coerente (>= 1, função do baseVolume do
    // cluster); com volume executado alto não há explosão por realimentação.
    // MAX_MM_QUANTITY permanece como salvaguarda defensiva (defense-in-depth).
    const MAX_MM_QUANTITY = 5_000
    const quantity = Math.min(MAX_MM_QUANTITY, Math.max(1, Math.floor(ctx.baseVolume * 0.001)))
    const priceModifier = side === 'BUY' ? -0.001 : 0.001

    return { side, quantity, priceModifier, reason: 'compress_spread' }
  }
}
