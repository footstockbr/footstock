// ============================================================================
// FootStock — Regressão do contrato de quantidade livre (cota a cota)
// A regra antiga de lote (mínimo 100 + múltiplo de 100) foi removida em
// 2026-07-02. Este teste trava o novo contrato: inteiro positivo, mínimo 1.
// ============================================================================

import { CreateOrderSchema } from '@/lib/validators/order'

const baseMarketBuy = {
  ticker: 'POR3',
  type: 'MARKET',
  side: 'BUY',
}

describe('CreateOrderSchema — quantidade livre', () => {
  it.each([1, 10, 99, 100, 101, 137])('aceita quantidade inteira livre = %i', (quantity) => {
    const result = CreateOrderSchema.safeParse({ ...baseMarketBuy, quantity })
    expect(result.success).toBe(true)
  })

  it.each([0, -1, -100])('rejeita quantidade não positiva = %i', (quantity) => {
    const result = CreateOrderSchema.safeParse({ ...baseMarketBuy, quantity })
    expect(result.success).toBe(false)
  })

  it('rejeita quantidade fracionária', () => {
    const result = CreateOrderSchema.safeParse({ ...baseMarketBuy, quantity: 1.5 })
    expect(result.success).toBe(false)
  })

  it('NÃO rejeita mais quantidades fora do lote de 100 (101 é válido)', () => {
    const result = CreateOrderSchema.safeParse({ ...baseMarketBuy, quantity: 101 })
    expect(result.success).toBe(true)
  })
})
