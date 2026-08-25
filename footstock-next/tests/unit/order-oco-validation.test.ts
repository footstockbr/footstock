/**
 * Task 03 — contrato OCO unico entre formulario e validador.
 *
 * O mesmo conjunto de casos e exercitado contra os dois caminhos:
 *   (a) `validateOcoPriceRelation()`, consumido diretamente pelo `OrderForm`;
 *   (b) `CreateOrderSchema`, consumido pela rota `POST /api/v1/orders`.
 * Divergencia de sinal entre os dois quebra este teste.
 */
import { validateOcoPriceRelation, CreateOrderSchema } from '@/lib/validators/order'

type Case = {
  nome: string
  side: 'BUY' | 'SELL'
  price?: number
  stopLossPrice?: number
  takeProfitPrice?: number
  esperado: 'aceita' | 'rejeita'
}

const CASOS: Case[] = [
  {
    nome: 'relacao canonica stopLoss < price < takeProfit',
    side: 'SELL', stopLossPrice: 8, price: 10, takeProfitPrice: 12, esperado: 'aceita',
  },
  {
    nome: 'relacao invertida takeProfit < price < stopLoss',
    side: 'SELL', stopLossPrice: 12, price: 10, takeProfitPrice: 8, esperado: 'rejeita',
  },
  {
    nome: 'limite de igualdade stopLoss == price',
    side: 'SELL', stopLossPrice: 10, price: 10, takeProfitPrice: 12, esperado: 'rejeita',
  },
  {
    nome: 'limite de igualdade price == takeProfit',
    side: 'SELL', stopLossPrice: 8, price: 12, takeProfitPrice: 12, esperado: 'rejeita',
  },
  {
    nome: 'os tres precos iguais',
    side: 'SELL', stopLossPrice: 10, price: 10, takeProfitPrice: 10, esperado: 'rejeita',
  },
  {
    nome: 'OCO no lado BUY com relacao canonica',
    side: 'BUY', stopLossPrice: 8, price: 10, takeProfitPrice: 12, esperado: 'rejeita',
  },
  {
    nome: 'OCO no lado BUY com relacao invertida',
    side: 'BUY', stopLossPrice: 12, price: 10, takeProfitPrice: 8, esperado: 'rejeita',
  },
  {
    nome: 'stopLossPrice ausente',
    side: 'SELL', price: 10, takeProfitPrice: 12, esperado: 'rejeita',
  },
  {
    nome: 'takeProfitPrice ausente',
    side: 'SELL', stopLossPrice: 8, price: 10, esperado: 'rejeita',
  },
  {
    nome: 'price ausente',
    side: 'SELL', stopLossPrice: 8, takeProfitPrice: 12, esperado: 'rejeita',
  },
]

function pelaSchema(c: Case): boolean {
  const body: Record<string, unknown> = {
    ticker: 'POR3',
    type: 'OCO',
    side: c.side,
    quantity: 10,
  }
  if (c.price !== undefined) body.price = c.price
  if (c.stopLossPrice !== undefined) body.stopLossPrice = c.stopLossPrice
  if (c.takeProfitPrice !== undefined) body.takeProfitPrice = c.takeProfitPrice
  return CreateOrderSchema.safeParse(body).success
}

function peloHelper(c: Case): boolean {
  return validateOcoPriceRelation({
    side: c.side,
    price: c.price,
    stopLossPrice: c.stopLossPrice,
    takeProfitPrice: c.takeProfitPrice,
  }).valid
}

describe('contrato OCO — paridade formulario x validador', () => {
  test.each(CASOS)('$nome → $esperado', (c) => {
    const aceitoEsperado = c.esperado === 'aceita'
    expect(peloHelper(c)).toBe(aceitoEsperado)
    expect(pelaSchema(c)).toBe(aceitoEsperado)
  })

  test('helper e schema concordam em 100% dos casos', () => {
    const divergentes = CASOS.filter((c) => peloHelper(c) !== pelaSchema(c))
    expect(divergentes.map((c) => c.nome)).toEqual([])
  })
})

describe('contrato OCO — codigos de violacao', () => {
  test('BUY produz SIDE_NOT_SELL apontando para o campo side', () => {
    const r = validateOcoPriceRelation({ side: 'BUY', price: 10, stopLossPrice: 8, takeProfitPrice: 12 })
    expect(r.valid).toBe(false)
    expect(r.code).toBe('SIDE_NOT_SELL')
    expect(r.field).toBe('side')
    expect(r.message).toContain('SELL')
  })

  test('preco faltante produz MISSING_PRICES', () => {
    const r = validateOcoPriceRelation({ side: 'SELL', price: 10, takeProfitPrice: 12 })
    expect(r.valid).toBe(false)
    expect(r.code).toBe('MISSING_PRICES')
  })

  test('relacao invertida produz INVALID_RELATION apontando para stopLossPrice', () => {
    const r = validateOcoPriceRelation({ side: 'SELL', price: 10, stopLossPrice: 12, takeProfitPrice: 8 })
    expect(r.valid).toBe(false)
    expect(r.code).toBe('INVALID_RELATION')
    expect(r.field).toBe('stopLossPrice')
  })

  test('relacao canonica e valida e nao carrega codigo', () => {
    const r = validateOcoPriceRelation({ side: 'SELL', price: 10, stopLossPrice: 8, takeProfitPrice: 12 })
    expect(r).toEqual({ valid: true })
  })
})
