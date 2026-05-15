// ============================================================================
// Foot Stock Motor — OrderBook
// Matching básico de ordens LIMIT, STOP_LOSS e TAKE_PROFIT.
// ============================================================================

import type { OrderBookEntry } from '../types/motor.types'
import { assertPlanAllowsOrderType } from '../lib/auth'

interface MatchResult {
  filledOrderId: string
  executedPrice: number
  quantity: number
}

export class OrderBook {
  private buyOrders: Map<string, OrderBookEntry> = new Map()
  private sellOrders: Map<string, OrderBookEntry> = new Map()

  addOrder(order: OrderBookEntry): void {
    if (order.planType !== undefined) {
      assertPlanAllowsOrderType(order.planType, order.type, {
        isOcoComponent: order.isOcoComponent === true,
      })
    }

    if (order.side === 'BUY') {
      this.buyOrders.set(order.orderId, order)
    } else {
      this.sellOrders.set(order.orderId, order)
    }
  }

  removeOrder(orderId: string): boolean {
    if (this.buyOrders.has(orderId)) {
      this.buyOrders.delete(orderId)
      return true
    }
    if (this.sellOrders.has(orderId)) {
      this.sellOrders.delete(orderId)
      return true
    }
    return false
  }

  /**
   * Tenta fazer matching de ordens contra o preço atual.
   * BUY LIMIT: executa se currentPrice <= order.price
   * SELL LIMIT: executa se currentPrice >= order.price
   * STOP_LOSS: executa se currentPrice <= order.price
   * TAKE_PROFIT: executa se currentPrice >= order.price
   */
  matchOrders(currentPrice: number): MatchResult[] {
    const results: MatchResult[] = []

    // BUY LIMIT e STOP_LOSS (BUY side)
    for (const [id, order] of this.buyOrders) {
      let shouldFill = false

      if (order.type === 'LIMIT' && currentPrice <= order.price) {
        shouldFill = true
      } else if (order.type === 'STOP_LOSS' && currentPrice <= order.price) {
        shouldFill = true
      }

      if (shouldFill) {
        results.push({
          filledOrderId: id,
          executedPrice: currentPrice,
          quantity: order.quantity,
        })
        this.buyOrders.delete(id)
      }
    }

    // SELL LIMIT e TAKE_PROFIT (SELL side)
    for (const [id, order] of this.sellOrders) {
      let shouldFill = false

      if (order.type === 'LIMIT' && currentPrice >= order.price) {
        shouldFill = true
      } else if (order.type === 'TAKE_PROFIT' && currentPrice >= order.price) {
        shouldFill = true
      }

      if (shouldFill) {
        results.push({
          filledOrderId: id,
          executedPrice: currentPrice,
          quantity: order.quantity,
        })
        this.sellOrders.delete(id)
      }
    }

    return results
  }

  getBuyVolume(): number {
    return [...this.buyOrders.values()].reduce((sum, o) => sum + o.quantity, 0)
  }

  getSellVolume(): number {
    return [...this.sellOrders.values()].reduce((sum, o) => sum + o.quantity, 0)
  }

  getOrderCount(): number {
    return this.buyOrders.size + this.sellOrders.size
  }
}
