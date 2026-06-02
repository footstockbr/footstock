// ============================================================================
// FootStock — Contrato de State Machine de Ordens
// Verifica transições válidas/inválidas do OrderStatus e integridade do enum
// Rastreabilidade: INT-011, INT-012, INT-013 | US-007 | module-28/TASK-2/ST002
//
// Schema real (Prisma):
//   enum OrderStatus { OPEN FILLED CANCELLED EXPIRED PARTIAL }
//
// State machine:
//   OPEN    → FILLED, CANCELLED, EXPIRED, PARTIAL
//   PARTIAL → FILLED, CANCELLED
//   FILLED, CANCELLED, EXPIRED → terminal (sem transições)
// ============================================================================

import { Prisma } from '@prisma/client'

type OrderStatus = 'OPEN' | 'FILLED' | 'CANCELLED' | 'EXPIRED' | 'PARTIAL'

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  OPEN: ['FILLED', 'CANCELLED', 'EXPIRED', 'PARTIAL'],
  PARTIAL: ['FILLED', 'CANCELLED'],
  FILLED: [],
  CANCELLED: [],
  EXPIRED: [],
}

function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to)
}

describe('ST002: Order State Machine Contract', () => {
  describe('[SUCCESS] transições válidas de OPEN', () => {
    it('OPEN → FILLED (motor executa ordem completa)', () => {
      expect(isValidTransition('OPEN', 'FILLED')).toBe(true)
    })

    it('OPEN → CANCELLED (usuário cancela antes da execução)', () => {
      expect(isValidTransition('OPEN', 'CANCELLED')).toBe(true)
    })

    it('OPEN → EXPIRED (TTL expirado para ordem agendada)', () => {
      expect(isValidTransition('OPEN', 'EXPIRED')).toBe(true)
    })

    it('OPEN → PARTIAL (execução parcial — quantidade disponível insuficiente)', () => {
      expect(isValidTransition('OPEN', 'PARTIAL')).toBe(true)
    })
  })

  describe('[SUCCESS] transições válidas de PARTIAL', () => {
    it('PARTIAL → FILLED (restante da ordem executado)', () => {
      expect(isValidTransition('PARTIAL', 'FILLED')).toBe(true)
    })

    it('PARTIAL → CANCELLED (usuário cancela ordem parcialmente executada)', () => {
      expect(isValidTransition('PARTIAL', 'CANCELLED')).toBe(true)
    })
  })

  describe('[ERROR] transições inválidas de estados terminais', () => {
    it('FILLED → CANCELLED deve ser bloqueado (estado terminal)', () => {
      expect(isValidTransition('FILLED', 'CANCELLED')).toBe(false)
    })

    it('FILLED → OPEN deve ser bloqueado (sem reversão)', () => {
      expect(isValidTransition('FILLED', 'OPEN')).toBe(false)
    })

    it('CANCELLED → FILLED deve ser bloqueado (estado terminal)', () => {
      expect(isValidTransition('CANCELLED', 'FILLED')).toBe(false)
    })

    it('CANCELLED → OPEN deve ser bloqueado (sem reversão)', () => {
      expect(isValidTransition('CANCELLED', 'OPEN')).toBe(false)
    })

    it('EXPIRED → FILLED deve ser bloqueado (estado terminal)', () => {
      expect(isValidTransition('EXPIRED', 'FILLED')).toBe(false)
    })

    it('EXPIRED → OPEN deve ser bloqueado (sem reativação)', () => {
      expect(isValidTransition('EXPIRED', 'OPEN')).toBe(false)
    })
  })

  describe('[EDGE] integridade do enum OrderStatus via DMMF', () => {
    const orderStatusEnum = Prisma.dmmf.datamodel.enums.find(
      (e) => e.name === 'OrderStatus',
    )

    it('enum OrderStatus existe no schema Prisma', () => {
      expect(orderStatusEnum).toBeDefined()
    })

    it('enum OrderStatus tem exatamente 5 valores', () => {
      expect(orderStatusEnum?.values).toHaveLength(5)
    })

    it('enum contém OPEN, FILLED, CANCELLED, EXPIRED, PARTIAL', () => {
      const values = orderStatusEnum?.values.map((v) => v.name).sort()
      expect(values).toEqual(['CANCELLED', 'EXPIRED', 'FILLED', 'OPEN', 'PARTIAL'])
    })

    it('todos os estados definidos no VALID_TRANSITIONS existem no enum DMMF', () => {
      const dmmfValues = new Set(orderStatusEnum?.values.map((v) => v.name) ?? [])
      const stateMachineStates = Object.keys(VALID_TRANSITIONS) as OrderStatus[]

      stateMachineStates.forEach((state) => {
        expect(dmmfValues.has(state)).toBe(true)
      })
    })
  })
})
