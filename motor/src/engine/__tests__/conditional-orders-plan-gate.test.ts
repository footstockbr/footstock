/**
 * @jest-environment node
 */
// ============================================================================
// Plan gate STOP_LOSS / TAKE_PROFIT standalone (task-007 / 2026-05-14)
// Cobre: JOGADOR rejeita STOP_LOSS, CRAQUE rejeita TAKE_PROFIT, LENDA aceita ambos,
//        OCO components (isOcoComponent=true) sao aceitos para qualquer plano,
//        erro retornado e instancia de OrderTypeNotAllowedForPlanError.
// ============================================================================

import {
  assertPlanAllowsOrderType,
  OrderTypeNotAllowedForPlanError,
} from '../../lib/auth'
import { OrderBook } from '../OrderBook'
import type { OrderBookEntry } from '../../types/motor.types'

function makeEntry(overrides: Partial<OrderBookEntry> = {}): OrderBookEntry {
  return {
    orderId: 'o-1',
    userId: 'u-1',
    side: 'BUY',
    type: 'STOP_LOSS',
    quantity: 1,
    price: 10,
    createdAt: Date.now(),
    ...overrides,
  }
}

describe('plan gate STOP_LOSS/TAKE_PROFIT standalone', () => {
  test('(i) JOGADOR rejects standalone STOP_LOSS', () => {
    expect(() =>
      assertPlanAllowsOrderType('JOGADOR', 'STOP_LOSS', { isOcoComponent: false }),
    ).toThrow(OrderTypeNotAllowedForPlanError)
  })

  test('(ii) CRAQUE rejects standalone TAKE_PROFIT', () => {
    expect(() =>
      assertPlanAllowsOrderType('CRAQUE', 'TAKE_PROFIT', { isOcoComponent: false }),
    ).toThrow(OrderTypeNotAllowedForPlanError)
  })

  test('(iii) LENDA accepts both standalone STOP_LOSS and TAKE_PROFIT', () => {
    expect(() =>
      assertPlanAllowsOrderType('LENDA', 'STOP_LOSS', { isOcoComponent: false }),
    ).not.toThrow()
    expect(() =>
      assertPlanAllowsOrderType('LENDA', 'TAKE_PROFIT', { isOcoComponent: false }),
    ).not.toThrow()
  })

  test('(iv) OCO component (isOcoComponent=true) is accepted for any plan', () => {
    for (const plan of ['JOGADOR', 'CRAQUE', 'LENDA'] as const) {
      expect(() =>
        assertPlanAllowsOrderType(plan, 'STOP_LOSS', { isOcoComponent: true }),
      ).not.toThrow()
      expect(() =>
        assertPlanAllowsOrderType(plan, 'TAKE_PROFIT', { isOcoComponent: true }),
      ).not.toThrow()
    }
  })

  test('(v) thrown error is instance of OrderTypeNotAllowedForPlanError with correct code', () => {
    try {
      assertPlanAllowsOrderType('JOGADOR', 'STOP_LOSS', { isOcoComponent: false })
      fail('expected OrderTypeNotAllowedForPlanError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(OrderTypeNotAllowedForPlanError)
      const typed = err as OrderTypeNotAllowedForPlanError
      expect(typed.code).toBe('ORDER_TYPE_NOT_ALLOWED_FOR_PLAN')
      expect(typed.orderType).toBe('STOP_LOSS')
      expect(typed.planType).toBe('JOGADOR')
      expect(typed.requiredPlan).toBe('LENDA')
    }
  })

  test('LIMIT/MARKET/OCO/SCHEDULED never throw regardless of plan', () => {
    for (const plan of ['JOGADOR', 'CRAQUE', 'LENDA'] as const) {
      for (const type of ['LIMIT', 'MARKET', 'OCO', 'SCHEDULED'] as const) {
        expect(() =>
          assertPlanAllowsOrderType(plan, type, { isOcoComponent: false }),
        ).not.toThrow()
      }
    }
  })

  describe('OrderBook.addOrder integration', () => {
    test('rejects standalone STOP_LOSS from JOGADOR via OrderBook.addOrder', () => {
      const book = new OrderBook()
      const entry = makeEntry({
        type: 'STOP_LOSS',
        planType: 'JOGADOR',
        isOcoComponent: false,
      })
      expect(() => book.addOrder(entry)).toThrow(OrderTypeNotAllowedForPlanError)
      expect(book.getOrderCount()).toBe(0)
    })

    test('accepts standalone STOP_LOSS from LENDA via OrderBook.addOrder', () => {
      const book = new OrderBook()
      const entry = makeEntry({
        type: 'STOP_LOSS',
        planType: 'LENDA',
        isOcoComponent: false,
      })
      expect(() => book.addOrder(entry)).not.toThrow()
      expect(book.getOrderCount()).toBe(1)
    })

    test('accepts STOP_LOSS OCO component from CRAQUE via OrderBook.addOrder', () => {
      const book = new OrderBook()
      const entry = makeEntry({
        type: 'STOP_LOSS',
        planType: 'CRAQUE',
        isOcoComponent: true,
      })
      expect(() => book.addOrder(entry)).not.toThrow()
      expect(book.getOrderCount()).toBe(1)
    })

    test('no plan metadata = no gate (backward compatibility)', () => {
      const book = new OrderBook()
      const entry = makeEntry({ type: 'STOP_LOSS' })
      expect(() => book.addOrder(entry)).not.toThrow()
      expect(book.getOrderCount()).toBe(1)
    })
  })
})
