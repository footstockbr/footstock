// ============================================================================
// FootStock — Order Contract: State Machine Formal
// Source of truth para todas as transições de status de ordens.
// Rastreabilidade: INT-011, INT-012, INT-013 / TASK-0/ST002
// ============================================================================

import { ORDER_STATUS, type OrderStatus } from '@/lib/enums'

// ---------------------------------------------------------------------------
// State Machine — imutável (Object.freeze)
//
// Vocabulário canônico, igual ao enum OrderStatus do Prisma:
//   OPEN   = aguardando execução  (a spec do módulo chamava de PENDING)
//   FILLED = executada            (a spec do módulo chamava de EXECUTED)
// B7 (09-02): os aliases PENDING/EXECUTED saíram de `ORDER_STATUS`; a tradução
// para a linguagem da spec é comentário, não uma segunda chave no enum.
// ---------------------------------------------------------------------------

export const ORDER_STATE_MACHINE: Readonly<Record<string, readonly OrderStatus[]>> =
  Object.freeze({
    [ORDER_STATUS.OPEN]:      Object.freeze([ORDER_STATUS.FILLED, ORDER_STATUS.CANCELLED, ORDER_STATUS.EXPIRED, ORDER_STATUS.PARTIAL]),
    [ORDER_STATUS.PARTIAL]:   Object.freeze([ORDER_STATUS.FILLED, ORDER_STATUS.CANCELLED, ORDER_STATUS.EXPIRED]),
    [ORDER_STATUS.FILLED]:    Object.freeze([] as OrderStatus[]),  // terminal
    [ORDER_STATUS.CANCELLED]: Object.freeze([] as OrderStatus[]),  // terminal
    [ORDER_STATUS.EXPIRED]:   Object.freeze([] as OrderStatus[]),  // terminal
  })

// ---------------------------------------------------------------------------
// Erro de transição inválida
// ---------------------------------------------------------------------------

export class OrderStateTransitionError extends Error {
  constructor(
    public readonly from: OrderStatus,
    public readonly to: OrderStatus,
    public readonly orderId?: string,
  ) {
    super(
      `Transição de status inválida para ordem${orderId ? ` ${orderId}` : ''}: ${from} → ${to}`
    )
    this.name = 'OrderStateTransitionError'
  }
}

// ---------------------------------------------------------------------------
// Helpers de transição
// ---------------------------------------------------------------------------

/**
 * Verifica se a transição de status é permitida pela state machine.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  const allowed = ORDER_STATE_MACHINE[from]
  return allowed !== undefined && (allowed as readonly OrderStatus[]).includes(to)
}

/**
 * Valida a transição de status e lança OrderStateTransitionError se inválida.
 * Deve ser chamado ANTES de qualquer prisma.order.update({ status: ... }).
 */
export function validateTransition(
  from: OrderStatus,
  to: OrderStatus,
  orderId?: string,
): void {
  if (!canTransition(from, to)) {
    throw new OrderStateTransitionError(from, to, orderId)
  }
}
