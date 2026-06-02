// ============================================================================
// FootStock Motor — MotorTick Builder e Serialização
// ============================================================================

import type { MotorTick, AssetState, SessionType } from '../types/motor.types'

export function buildMotorTick(
  state: AssetState,
  newPrice: number,
  sessionType: SessionType
): MotorTick {
  const change = newPrice - state.closePrice
  const changePercent = state.closePrice > 0
    ? (change / state.closePrice) * 100
    : 0

  return {
    assetId: state.id,
    ticker: state.ticker,
    price: parseFloat(newPrice.toFixed(8)),
    open: parseFloat(state.openPrice.toFixed(8)),
    high: parseFloat(Math.max(state.highPrice, newPrice).toFixed(8)),
    low: parseFloat(Math.min(state.lowPrice, newPrice).toFixed(8)),
    close: parseFloat(state.closePrice.toFixed(8)),
    volume: state.volume,
    change: parseFloat(change.toFixed(8)),
    changePercent: parseFloat(changePercent.toFixed(4)),
    sessionType,
    timestamp: Date.now(),
  }
}

/**
 * Constrói um tick de halt para ativo suspenso (circuit breaker).
 * Mantém preço atual sem variação — apenas sinaliza estado de halt.
 */
export function buildHaltTick(
  state: AssetState,
  sessionType: SessionType,
  haltReason: string | null = 'CIRCUIT_BREAKER',
  estimatedResume: number | null = null
): MotorTick {
  return {
    assetId: state.id,
    ticker: state.ticker,
    price: parseFloat(state.currentPrice.toFixed(8)),
    open: parseFloat(state.openPrice.toFixed(8)),
    high: parseFloat(state.highPrice.toFixed(8)),
    low: parseFloat(state.lowPrice.toFixed(8)),
    close: parseFloat(state.closePrice.toFixed(8)),
    volume: state.volume,
    change: 0,
    changePercent: 0,
    sessionType,
    timestamp: Date.now(),
    isHalted: true,
    haltReason,
    estimatedResume,
  }
}

export function serializeTick(ticks: MotorTick[]): string {
  return JSON.stringify({
    type: 'TICK',
    timestamp: Date.now(),
    ticks,
  })
}
