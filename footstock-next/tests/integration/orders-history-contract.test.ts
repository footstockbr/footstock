// ============================================================================
// FootStock — Contrato de historico de ordens (GET /api/v1/orders)
// Cobre os criterios 5 e 9 do brainstorm 08-24:
//   - preco/hora SOLICITADOS separados de preco/hora EXECUTADOS;
//   - a taxa nunca somada duas vezes (TRADE canonico, `Order.fee` ignorado).
// ============================================================================

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/v1/orders/route'
import { orderService } from '@/lib/services/OrderService'
import {
  ORDER_HISTORY_DTO_FIELDS,
  serializeOrderHistory,
} from '@/lib/contracts/order-history-contract'
import type {
  OrderHistoryDto,
  OrderSettlementTransaction,
} from '@/lib/contracts/order-history-contract'

const mockFindMany = jest.fn()
const mockCount = jest.fn()
const mockGetAuthUser = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}))

jest.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: { publish: jest.fn(), get: jest.fn(), set: jest.fn() },
  redis: { get: jest.fn(), set: jest.fn() },
}))

function decimal(value: number) {
  return { toNumber: () => value }
}

function makeRequest(search = '') {
  return new NextRequest(`http://localhost/api/v1/orders${search ? `?${search}` : ''}`)
}

// Par canonico gravado pelo motor: TRADE (caixa, ja liquido) + FEE (memorando,
// com saldo NULO). Ver `motor/src/engine/settlement.ts::_recordTradeAndFee`.
function settlementOf(
  fsAmount: number,
  balanceBefore: number,
  balanceAfter: number,
): OrderSettlementTransaction[] {
  return [
    {
      financialType: 'TRADE',
      quantity: 10,
      price: decimal(12.5),
      fee: decimal(0.35),
      fsAmount: decimal(fsAmount),
      balanceBefore: decimal(balanceBefore),
      balanceAfter: decimal(balanceAfter),
    },
    {
      // Linha de memorando: caixa NULO de proposito.
      financialType: 'FEE',
      quantity: null,
      price: null,
      fee: decimal(0.35),
      fsAmount: decimal(-0.35),
      balanceBefore: null,
      balanceAfter: null,
    },
  ]
}

// Ordem de VENDA executada: 10 cotas a FS$ 12,50 com taxa de FS$ 0,35.
// `Order.fee` esta preenchido com a ESTIMATIVA da criacao (FS$ 0,99) para
// provar que ela nao entra no liquido quando existe TRADE.
function executedSellOrder() {
  return {
    id: 'order-executed',
    userId: 'user-1',
    assetId: 'asset-1',
    type: 'LIMIT',
    side: 'SELL',
    status: 'FILLED',
    quantity: 10,
    price: decimal(12.0), // preco SOLICITADO
    executedPrice: decimal(12.5), // preco EXECUTADO
    fee: decimal(0.99), // estimativa da criacao (NAO deve entrar no liquido)
    scheduledAt: null,
    executedAt: new Date('2026-08-24T14:31:10.000Z'),
    groupId: null,
    createdAt: new Date('2026-08-24T14:30:00.000Z'),
    asset: { ticker: 'URU3', displayName: 'Uruguaiana FC' },
    transactions: settlementOf(124.65, 1000, 1124.65),
  }
}

// Ordem LIMIT aberta: solicitada, nunca executada.
function openOrder() {
  return {
    id: 'order-open',
    userId: 'user-1',
    assetId: 'asset-2',
    type: 'LIMIT',
    side: 'BUY',
    status: 'OPEN',
    quantity: 5,
    price: decimal(9.5),
    executedPrice: null,
    fee: decimal(0.25),
    scheduledAt: new Date('2026-08-25T13:00:00.000Z'),
    executedAt: null,
    groupId: null,
    createdAt: new Date('2026-08-24T15:00:00.000Z'),
    asset: { ticker: 'FLA3', displayName: 'Flamengo' },
    transactions: [] as OrderSettlementTransaction[],
  }
}

async function getPayload(search = ''): Promise<OrderHistoryDto[]> {
  const res = await GET(makeRequest(search))
  expect(res.status).toBe(200)
  const body = (await res.json()) as { data: OrderHistoryDto[] }
  return body.data
}

describe('GET /api/v1/orders — contrato de historico', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAuthUser.mockResolvedValue({ user: { id: 'user-1' } })
    mockCount.mockResolvedValue(2)
  })

  test('retorna 401 quando usuario nao autenticado', async () => {
    mockGetAuthUser.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  test('carrega a liquidacao junto da ordem (include transactions)', async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    await orderService.getOrders('user-1', { page: 1, limit: 20 })

    const args = mockFindMany.mock.calls[0][0] as {
      include: { asset: unknown; transactions?: { select: Record<string, boolean> } }
    }
    expect(args.include.asset).toBeDefined()
    expect(args.include.transactions).toBeDefined()
    const select = args.include.transactions!.select
    for (const field of [
      'financialType',
      'quantity',
      'price',
      'fee',
      'fsAmount',
      'balanceBefore',
      'balanceAfter',
    ]) {
      expect(select[field]).toBe(true)
    }
  })

  test('emite todos os campos do DTO em cada item', async () => {
    mockFindMany.mockResolvedValue([executedSellOrder(), openOrder()])
    const data = await getPayload()

    expect(data).toHaveLength(2)
    for (const item of data) {
      for (const field of ORDER_HISTORY_DTO_FIELDS) {
        expect(Object.prototype.hasOwnProperty.call(item, field)).toBe(true)
      }
    }
  })

  // ── Criterio 5: solicitado vs executado ──────────────────────────────────
  test('preco e hora solicitados aparecem separados de preco e hora executados', async () => {
    mockFindMany.mockResolvedValue([executedSellOrder(), openOrder()])
    const [executed, open] = await getPayload()

    expect(executed.requestedPrice).toBe(12.0)
    expect(executed.executedPrice).toBe(12.5)
    expect(executed.requestedPrice).not.toBe(executed.executedPrice)
    expect(executed.createdAt).toBe('2026-08-24T14:30:00.000Z')
    expect(executed.executedAt).toBe('2026-08-24T14:31:10.000Z')
    expect(executed.createdAt).not.toBe(executed.executedAt)

    // Ordem sem execucao mantem o solicitado e nao herda nada do executado.
    expect(open.requestedPrice).toBe(9.5)
    expect(open.executedPrice).toBeNull()
    expect(open.scheduledAt).toBe('2026-08-25T13:00:00.000Z')
    expect(open.executedAt).toBeNull()
  })

  test('nao colapsa requestedPrice em executedPrice em ordem a mercado', async () => {
    const marketOrder = {
      ...executedSellOrder(),
      id: 'order-market',
      type: 'MARKET',
      price: null,
    }
    mockFindMany.mockResolvedValue([marketOrder])
    const [item] = await getPayload()

    expect(item.requestedPrice).toBeNull()
    expect(item.executedPrice).toBe(12.5)
  })

  // ── Criterio 9: taxa nunca somada duas vezes ─────────────────────────────
  test('com TRADE presente a taxa vem da liquidacao e Order.fee nao entra no liquido', async () => {
    mockFindMany.mockResolvedValue([executedSellOrder()])
    const [item] = await getPayload()

    expect(item.financialSource).toBe('TRADE')
    expect(item.feeKind).toBe('EXECUTED')
    // Taxa executada (0.35), nunca a estimativa da ordem (0.99).
    expect(item.fee).toBe(0.35)
    expect(item.grossAmount).toBe(125)
    // Liquido = bruto - taxa UMA vez. Se a taxa fosse somada duas vezes daria 124.30.
    expect(item.netAmount).toBe(124.65)
    // Caixa observado sai so da linha TRADE (ja liquida). A linha FEE e memorando.
    expect(item.cashDelta).toBe(124.65)
    expect(item.cashDelta).toBe(item.netAmount)
  })

  test('linha FEE nao e somada ao cashDelta mesmo com balanco preenchido nela', async () => {
    const order = executedSellOrder()
    // Cenario defensivo: dado sujo com balanco na linha FEE.
    order.transactions[1] = {
      ...order.transactions[1],
      balanceBefore: decimal(1124.65),
      balanceAfter: decimal(1124.3),
    }
    mockFindMany.mockResolvedValue([order])
    const [item] = await getPayload()

    expect(item.cashDelta).toBe(124.65)
    expect(item.fee).toBe(0.35)
    expect(item.netAmount).toBe(124.65)
  })

  test('compra executada tem netAmount negativo com a taxa contada uma vez', async () => {
    const buy = {
      ...executedSellOrder(),
      id: 'order-buy',
      side: 'BUY',
      fee: decimal(5), // estimativa alta de proposito
      transactions: settlementOf(-125.35, 1000, 874.65),
    }
    mockFindMany.mockResolvedValue([buy])
    const [item] = await getPayload()

    expect(item.fee).toBe(0.35)
    expect(item.grossAmount).toBe(125)
    expect(item.netAmount).toBe(-125.35)
    expect(item.cashDelta).toBe(-125.35)
  })

  test('taxa cai para a linha FEE quando TRADE.fee vem nulo, sem duplicar', async () => {
    const order = executedSellOrder()
    order.transactions[0] = { ...order.transactions[0], fee: null }
    mockFindMany.mockResolvedValue([order])
    const [item] = await getPayload()

    expect(item.fee).toBe(0.35)
    expect(item.feeKind).toBe('EXECUTED')
    expect(item.netAmount).toBe(124.65)
  })

  // ── Ordem sem execucao ───────────────────────────────────────────────────
  test('ordem sem execucao retorna executedPrice/executedAt nulos e source NONE', async () => {
    mockFindMany.mockResolvedValue([openOrder()])
    const [item] = await getPayload()

    expect(item.status).toBe('OPEN')
    expect(item.executedPrice).toBeNull()
    expect(item.executedAt).toBeNull()
    expect(item.financialSource).toBe('NONE')
    expect(item.grossAmount).toBeNull()
    expect(item.cashDelta).toBeNull()
    expect(item.netAmount).toBeNull()
    // A estimativa da criacao continua visivel, etiquetada como estimativa.
    expect(item.fee).toBe(0.25)
    expect(item.feeKind).toBe('ESTIMATED')
  })

  test('ordem cancelada sem liquidacao nao fabrica valor financeiro', async () => {
    const cancelled = { ...openOrder(), id: 'order-cancelled', status: 'CANCELLED' }
    mockFindMany.mockResolvedValue([cancelled])
    const [item] = await getPayload()

    expect(item.financialSource).toBe('NONE')
    expect(item.executedPrice).toBeNull()
    expect(item.netAmount).toBeNull()
  })

  // ── Fase 3: motivo do encerramento ───────────────────────────────────────
  test('cancelReason atravessa do banco ate o DTO', async () => {
    const cancelled = {
      ...openOrder(),
      id: 'order-reason',
      status: 'CANCELLED',
      cancelReason: 'EXECUTION_RETRY_EXHAUSTED',
    }
    mockFindMany.mockResolvedValue([cancelled])
    const [item] = await getPayload()

    // O campo e escrito pelo MOTOR (schema raiz) e lido pelo front (schema
    // canonico). Drift entre as duas linhagens vira campo nulo eterno sem erro
    // nenhum — risco 8.4 do design. Este teste e a trava do lado da leitura.
    expect(item.cancelReason).toBe('EXECUTION_RETRY_EXHAUSTED')
  })

  test('ordem viva ou legada expoe cancelReason null, nunca undefined', () => {
    // `undefined` some no JSON.stringify e o campo desaparece da resposta; a UI
    // entao nao consegue distinguir "sem motivo" de "campo nao veio".
    const dto = serializeOrderHistory(openOrder())

    expect(dto.cancelReason).toBeNull()
    expect(Object.prototype.hasOwnProperty.call(dto, 'cancelReason')).toBe(true)
  })

  // ── Fallback explicito ───────────────────────────────────────────────────
  test('ordem executada sem TRADE usa Order.fee marcado como ORDER_FALLBACK', () => {
    const order = { ...executedSellOrder(), transactions: [] }
    const dto = serializeOrderHistory(order)

    expect(dto.financialSource).toBe('ORDER_FALLBACK')
    expect(dto.feeKind).toBe('ESTIMATED')
    expect(dto.fee).toBe(0.99)
    expect(dto.executedPrice).toBe(12.5)
    // Sem liquidacao nao existe caixa observado: nada de valor fabricado.
    expect(dto.cashDelta).toBeNull()
    expect(dto.netAmount).toBe(124.01)
  })

  test('asset ausente vira null sem quebrar o item', async () => {
    const orphan = { ...openOrder(), id: 'order-orphan', asset: null }
    mockFindMany.mockResolvedValue([orphan])
    const [item] = await getPayload()

    expect(item.asset).toBeNull()
    expect(item.assetId).toBe('asset-2')
  })

  test('preserva a paginacao do servico', async () => {
    mockFindMany.mockResolvedValue([openOrder()])
    mockCount.mockResolvedValue(41)
    const res = await GET(makeRequest('page=2&limit=20'))
    const body = (await res.json()) as { pagination: Record<string, number | boolean> }

    expect(body.pagination.page).toBe(2)
    expect(body.pagination.limit).toBe(20)
    expect(body.pagination.total).toBe(41)
    expect(body.pagination.totalPages).toBe(3)
    expect(body.pagination.hasNext).toBe(true)
  })
})
