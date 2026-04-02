// ============================================================================
// Foot Stock Motor — Order Contract (motor-local mirror)
// Espelha lib/contracts/order-contract.ts para uso no Railway motor.
// Source of truth: lib/contracts/order-contract.ts — manter sincronizado.
// Rastreabilidade: TASK-6/ST001-ST003 (auditoria module-14)
// ============================================================================

type OrderStatus = 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'EXPIRED'

const ORDER_STATE_MACHINE: Readonly<Record<OrderStatus, readonly OrderStatus[]>> =
  Object.freeze({
    OPEN:      Object.freeze(['FILLED', 'CANCELLED', 'EXPIRED'] as OrderStatus[]),
    PARTIAL:   Object.freeze(['FILLED', 'CANCELLED', 'EXPIRED'] as OrderStatus[]),
    FILLED:    Object.freeze([] as OrderStatus[]),
    CANCELLED: Object.freeze([] as OrderStatus[]),
    EXPIRED:   Object.freeze([] as OrderStatus[]),
  })

export class OrderStateTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
    public readonly orderId?: string,
  ) {
    super(`Transição de status inválida para ordem${orderId ? ` ${orderId}` : ''}: ${from} → ${to}`)
    this.name = 'OrderStateTransitionError'
  }
}

export function canTransition(from: string, to: string): boolean {
  const allowed = ORDER_STATE_MACHINE[from as OrderStatus]
  return allowed !== undefined && (allowed as readonly string[]).includes(to)
}

export function validateTransition(from: string, to: string, orderId?: string): void {
  if (!canTransition(from, to)) {
    throw new OrderStateTransitionError(from, to, orderId)
  }
}
