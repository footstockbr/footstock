// ============================================================================
// Foot Stock — Testes: order-contract (state machine)
// Rastreabilidade: INT-011, INT-012, INT-013 / TASK-0/ST002
// ============================================================================

import {
  ORDER_STATE_MACHINE,
  canTransition,
  validateTransition,
  OrderStateTransitionError,
} from './order-contract'
import { ORDER_STATUS } from '@/lib/enums'

describe('ORDER_STATE_MACHINE', () => {
  it('deve ser imutável (Object.freeze)', () => {
    expect(() => {
      // @ts-expect-error – tentativa de modificar objeto congelado
      ORDER_STATE_MACHINE[ORDER_STATUS.OPEN] = []
    }).toThrow()
  })

  it('OPEN deve ter transições para FILLED, CANCELLED, EXPIRED', () => {
    expect(ORDER_STATE_MACHINE[ORDER_STATUS.OPEN]).toContain(ORDER_STATUS.FILLED)
    expect(ORDER_STATE_MACHINE[ORDER_STATUS.OPEN]).toContain(ORDER_STATUS.CANCELLED)
    expect(ORDER_STATE_MACHINE[ORDER_STATUS.OPEN]).toContain(ORDER_STATUS.EXPIRED)
  })

  it('FILLED deve ser terminal (sem transições)', () => {
    expect(ORDER_STATE_MACHINE[ORDER_STATUS.FILLED]).toHaveLength(0)
  })

  it('CANCELLED deve ser terminal (sem transições)', () => {
    expect(ORDER_STATE_MACHINE[ORDER_STATUS.CANCELLED]).toHaveLength(0)
  })

  it('EXPIRED deve ser terminal (sem transições)', () => {
    expect(ORDER_STATE_MACHINE[ORDER_STATUS.EXPIRED]).toHaveLength(0)
  })
})

describe('canTransition', () => {
  it('OPEN → FILLED: válido', () => {
    expect(canTransition(ORDER_STATUS.OPEN, ORDER_STATUS.FILLED)).toBe(true)
  })

  it('OPEN → CANCELLED: válido', () => {
    expect(canTransition(ORDER_STATUS.OPEN, ORDER_STATUS.CANCELLED)).toBe(true)
  })

  it('OPEN → EXPIRED: válido', () => {
    expect(canTransition(ORDER_STATUS.OPEN, ORDER_STATUS.EXPIRED)).toBe(true)
  })

  it('FILLED → CANCELLED: inválido', () => {
    expect(canTransition(ORDER_STATUS.FILLED, ORDER_STATUS.CANCELLED)).toBe(false)
  })

  it('FILLED → FILLED: inválido', () => {
    expect(canTransition(ORDER_STATUS.FILLED, ORDER_STATUS.FILLED)).toBe(false)
  })

  it('CANCELLED → FILLED: inválido', () => {
    expect(canTransition(ORDER_STATUS.CANCELLED, ORDER_STATUS.FILLED)).toBe(false)
  })

  it('EXPIRED → CANCELLED: inválido', () => {
    expect(canTransition(ORDER_STATUS.EXPIRED, ORDER_STATUS.CANCELLED)).toBe(false)
  })

  it('CANCELLED → OPEN: inválido', () => {
    expect(canTransition(ORDER_STATUS.CANCELLED, ORDER_STATUS.OPEN)).toBe(false)
  })
})

describe('validateTransition', () => {
  it('OPEN → FILLED: não lança exceção', () => {
    expect(() => validateTransition(ORDER_STATUS.OPEN, ORDER_STATUS.FILLED)).not.toThrow()
  })

  it('OPEN → CANCELLED: não lança exceção', () => {
    expect(() => validateTransition(ORDER_STATUS.OPEN, ORDER_STATUS.CANCELLED)).not.toThrow()
  })

  it('OPEN → EXPIRED: não lança exceção', () => {
    expect(() => validateTransition(ORDER_STATUS.OPEN, ORDER_STATUS.EXPIRED)).not.toThrow()
  })

  it('FILLED → CANCELLED: lança OrderStateTransitionError', () => {
    expect(() =>
      validateTransition(ORDER_STATUS.FILLED, ORDER_STATUS.CANCELLED)
    ).toThrow(OrderStateTransitionError)
  })

  it('FILLED → CANCELLED: inclui from e to no erro', () => {
    try {
      validateTransition(ORDER_STATUS.FILLED, ORDER_STATUS.CANCELLED, 'order-123')
    } catch (err) {
      expect(err).toBeInstanceOf(OrderStateTransitionError)
      const e = err as OrderStateTransitionError
      expect(e.from).toBe(ORDER_STATUS.FILLED)
      expect(e.to).toBe(ORDER_STATUS.CANCELLED)
      expect(e.orderId).toBe('order-123')
    }
  })

  it('EXPIRED → CANCELLED: lança OrderStateTransitionError', () => {
    expect(() =>
      validateTransition(ORDER_STATUS.EXPIRED, ORDER_STATUS.CANCELLED)
    ).toThrow(OrderStateTransitionError)
  })

  it('CANCELLED → FILLED: lança OrderStateTransitionError', () => {
    expect(() =>
      validateTransition(ORDER_STATUS.CANCELLED, ORDER_STATUS.FILLED)
    ).toThrow(OrderStateTransitionError)
  })
})
