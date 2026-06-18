// ============================================================================
// FootStock Motor — BaseAgent
// Classe base abstrata para agentes de mercado simulados.
// Todos os agentes extendem BaseAgent e implementam decide().
// ============================================================================

import type { SessionType } from '../types/motor.types'
import { logger } from '../utils/logger'

export interface AgentDecision {
  side: 'BUY' | 'SELL' | 'HOLD'
  quantity: number
  priceModifier: number
  reason: string
}

export interface MarketContext {
  ticker: string
  currentPrice: number
  fairValue: number
  priceChange24h: number
  volume24h: number
  /**
   * Profundidade canônica do book do cluster (params.baseVolume). É um valor
   * FIXO por cluster (não realimentado por state.volume), usado pelos agentes
   * que dimensionam quantity por profundidade — MarketMaker e PanicSeller — em
   * vez de volume24h. Desacopla quantity do volume executado (Item T2.2): com
   * state.volume zerado a quantity permanece finita e coerente; com volume alto
   * não há explosão por realimentação.
   */
  baseVolume: number
  bid: number
  ask: number
  spread: number
  session: SessionType
  volatilityMultiplier: number
}

export abstract class BaseAgent {
  constructor(
    readonly id: string,
    readonly weight: number
  ) {}

  abstract decide(ctx: MarketContext): AgentDecision

  protected clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  /** Box-Muller transform para gerar N(mean, stdDev) */
  protected randomGaussian(mean: number, stdDev: number): number {
    const u1 = Math.random()
    const u2 = Math.random()
    const z0 = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2)
    return mean + stdDev * z0
  }

  log(message: string, data?: object): void {
    logger.info(JSON.stringify({ agent: this.id, message, ...data }))
  }
}
