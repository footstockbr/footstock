/**
 * B7 (09-02) — `ORDER_STATUS` tem UM nome por estado.
 *
 * Os aliases legados `PENDING: 'OPEN'` e `EXECUTED: 'FILLED'` (nomes da spec
 * original do modulo, que nunca existiram como valor no enum OrderStatus do
 * Prisma) foram removidos. Duas chaves TS apontando para o mesmo literal fazem
 * `Object.keys` devolver 7 entradas para 5 estados reais — e todo consumidor que
 * itera o mapa (dropdown de filtro, tabela de rotulos, validacao de payload)
 * herda a duplicata em silencio. Esta suite trava a remocao.
 */

import { ORDER_STATUS, type OrderStatus } from '@/lib/enums'
import {
  ORDER_STATE_MACHINE,
  canTransition,
  validateTransition,
  OrderStateTransitionError,
} from '@/lib/contracts/order-contract'

const CANONICOS = ['OPEN', 'FILLED', 'CANCELLED', 'EXPIRED', 'PARTIAL'] as const

describe('B7 — vocabulario canonico de status de ordem', () => {
  it('ORDER_STATUS expoe exatamente os 5 estados do enum do Prisma', () => {
    expect(Object.keys(ORDER_STATUS).sort()).toEqual([...CANONICOS].sort())
  })

  it('nenhuma chave e alias: chave e valor coincidem em todas as entradas', () => {
    for (const [chave, valor] of Object.entries(ORDER_STATUS)) {
      expect(valor).toBe(chave)
    }
  })

  it('os nomes da spec legada nao voltam como chave', () => {
    expect(ORDER_STATUS).not.toHaveProperty('PENDING')
    expect(ORDER_STATUS).not.toHaveProperty('EXECUTED')
  })

  it('valores unicos: 5 chaves, 5 literais distintos', () => {
    expect(new Set(Object.values(ORDER_STATUS)).size).toBe(5)
  })
})

describe('B7 — a state machine sobrevive a remocao dos aliases', () => {
  it('cobre os 5 estados, sem chave duplicada nem estado orfao', () => {
    expect(Object.keys(ORDER_STATE_MACHINE).sort()).toEqual([...CANONICOS].sort())
  })

  it('OPEN e o unico estado inicial e leva aos 4 destinos legitimos', () => {
    expect([...ORDER_STATE_MACHINE.OPEN].sort()).toEqual(
      ['CANCELLED', 'EXPIRED', 'FILLED', 'PARTIAL'],
    )
  })

  it('PARTIAL nao volta para OPEN', () => {
    expect(canTransition('PARTIAL', 'OPEN')).toBe(false)
    expect(canTransition('PARTIAL', 'FILLED')).toBe(true)
  })

  it('FILLED, CANCELLED e EXPIRED sao terminais', () => {
    for (const terminal of ['FILLED', 'CANCELLED', 'EXPIRED'] as OrderStatus[]) {
      expect(ORDER_STATE_MACHINE[terminal]).toEqual([])
      for (const destino of CANONICOS) {
        expect(canTransition(terminal, destino)).toBe(false)
      }
    }
  })

  it('validateTransition lanca OrderStateTransitionError na transicao proibida', () => {
    expect(() => validateTransition('FILLED', 'OPEN', 'ord-1')).toThrow(
      OrderStateTransitionError,
    )
    expect(() => validateTransition('OPEN', 'FILLED', 'ord-1')).not.toThrow()
  })
})
