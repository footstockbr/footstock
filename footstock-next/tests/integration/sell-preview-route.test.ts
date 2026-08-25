// ============================================================================
// Task 05 — GET /api/v1/positions/[ticker]/sell-preview
// Cobre autenticacao, gate de staff, alias de ticker, ticker invalido, ativo
// inexistente, posicao ausente, posicao totalmente reservada e delay por plano.
//
// applyPriceDelay roda de verdade contra o prisma mockado: e o unico jeito de
// provar que priceDelayMinutes/isPriceDelayed vem do plano e nao de um literal.
// ============================================================================

import fs from 'fs'
import path from 'path'
import { GET } from '@/app/api/v1/positions/[ticker]/sell-preview/route'
import { SELL_PREVIEW_FIELDS } from '@/lib/contracts/sell-preview-contract'
import { getDelaySeconds } from '@/lib/services/DelayService'
import type { PlanType } from '@/lib/enums'

const mockGetAuthUser = jest.fn()
const mockResolve = jest.fn()

const client = {
  asset: { findUnique: jest.fn() },
  position: { findFirst: jest.fn() },
  order: { findMany: jest.fn() },
  priceHistory: { findMany: jest.fn() },
  $transaction: jest.fn(),
}

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: (...a: unknown[]) => client.asset.findUnique(...a) },
    position: { findFirst: (...a: unknown[]) => client.position.findFirst(...a) },
    order: { findMany: (...a: unknown[]) => client.order.findMany(...a) },
    priceHistory: { findMany: (...a: unknown[]) => client.priceHistory.findMany(...a) },
    $transaction: (cb: (tx: unknown) => unknown) => cb(client),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: { get: jest.fn(), set: jest.fn(), publish: jest.fn(), setex: jest.fn() },
}))

jest.mock('@/lib/auth', () => ({
  getAuthUser: (...a: unknown[]) => mockGetAuthUser(...a),
}))

jest.mock('@/services/AliasService', () => ({
  AliasService: { resolve: (...a: unknown[]) => mockResolve(...a) },
}))

// --- helpers ---------------------------------------------------------------

// Espelho minimo do Decimal do Prisma: `toNumber()` para leitura explicita e
// `valueOf()` porque o OrderService usa `Number(position.avgPrice)`.
function decimal(value: number) {
  return { toNumber: () => value, valueOf: () => value, toString: () => String(value) }
}

function makeRequest(ticker = 'URU3') {
  return new Request(`http://localhost/api/v1/positions/${ticker}/sell-preview`)
}

function makeParams(ticker: string) {
  return { params: Promise.resolve({ ticker }) }
}

function authAs(planType: PlanType | null, userType = 'PLAYER') {
  mockGetAuthUser.mockResolvedValue({
    userId: 'user-1',
    user: { id: 'user-1', userType, planType },
  })
}

/**
 * Semeia o ativo, a posicao e as ordens SELL abertas.
 * As duas chamadas de position.findFirst do OrderService sao distinguidas pelo
 * filtro de status: a primeira busca a posicao ABERTA, a segunda (fallback) a
 * ultima posicao LONG em qualquer status.
 */
function seed(opts: {
  asset?: { id: string; ticker: string; displayName: string; currentPrice: number } | null
  position?: { id: string; quantity: number; avgPrice: number; status: string } | null
  closedPosition?: { id: string; status: string } | null
  sellOrders?: { quantity: number; type: string; groupId: string | null }[]
  history?: { close: number; timestamp: Date }[]
}) {
  const asset =
    opts.asset === undefined
      ? { id: 'asset-1', ticker: 'URU3', displayName: 'Uruguaiana FC', currentPrice: 100 }
      : opts.asset

  client.asset.findUnique.mockResolvedValue(
    asset ? { ...asset, currentPrice: decimal(asset.currentPrice) } : null,
  )

  client.position.findFirst.mockImplementation((args: { where?: { status?: string } }) => {
    if (args?.where?.status === 'OPEN') {
      return Promise.resolve(
        opts.position
          ? { ...opts.position, avgPrice: decimal(opts.position.avgPrice) }
          : null,
      )
    }
    return Promise.resolve(opts.closedPosition ?? null)
  })

  client.order.findMany.mockResolvedValue(opts.sellOrders ?? [])

  const history = opts.history ?? [
    { close: 90, timestamp: new Date('2026-08-24T11:00:00.000Z') },
    { close: 80, timestamp: new Date('2026-08-24T10:00:00.000Z') },
  ]
  client.priceHistory.findMany.mockResolvedValue(
    history.map((h) => ({ close: h.close, timestamp: h.timestamp })),
  )
}

async function callRoute(ticker = 'URU3') {
  const res = await GET(makeRequest(ticker), makeParams(ticker))
  const body = await res.json()
  return { res, body }
}

// --- testes ----------------------------------------------------------------

describe('GET /api/v1/positions/[ticker]/sell-preview', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockResolve.mockImplementation((t: string) => Promise.resolve(t.toUpperCase()))
  })

  test('401 AUTH-001 quando nao autenticado', async () => {
    mockGetAuthUser.mockResolvedValue(null)
    const { res, body } = await callRoute()
    expect(res.status).toBe(401)
    expect(body.error.code).toBe('AUTH-001')
  })

  test('403 STAFF_CANNOT_TRADE para conta ADMIN', async () => {
    authAs(null, 'ADMIN')
    seed({})
    const { res, body } = await callRoute()
    expect(res.status).toBe(403)
    expect(body.error.code).toBe('STAFF_CANNOT_TRADE')
    // Gate antes de qualquer leitura de ativo: nao vaza existencia por status.
    expect(client.asset.findUnique).not.toHaveBeenCalled()
  })

  test('403 STAFF_CANNOT_TRADE para usuario sem plano', async () => {
    authAs(null, 'PLAYER')
    const { res, body } = await callRoute()
    expect(res.status).toBe(403)
    expect(body.error.code).toBe('STAFF_CANNOT_TRADE')
  })

  test('422 ASSET_051 para ticker com formato invalido', async () => {
    authAs('LENDA')
    const { res, body } = await callRoute('DROP--TABLE')
    expect(res.status).toBe(422)
    expect(body.error.code).toBe('ASSET_051')
    expect(mockResolve).not.toHaveBeenCalled()
  })

  test('404 ASSET_080 quando o alias nao resolve', async () => {
    authAs('LENDA')
    mockResolve.mockResolvedValue(null)
    const { res, body } = await callRoute('XYZ9')
    expect(res.status).toBe(404)
    expect(body.error.code).toBe('ASSET_080')
    expect(client.asset.findUnique).not.toHaveBeenCalled()
  })

  test('404 ASSET_080 quando o ativo nao existe no catalogo', async () => {
    authAs('LENDA')
    seed({ asset: null })
    const { res, body } = await callRoute()
    expect(res.status).toBe(404)
    expect(body.error.code).toBe('ASSET_080')
  })

  test('alias FLA3 resolve para URU3 e o DTO devolve o ticker canonico', async () => {
    authAs('LENDA')
    mockResolve.mockResolvedValue('URU3')
    seed({ position: { id: 'pos-1', quantity: 10, avgPrice: 50, status: 'OPEN' } })

    const { res, body } = await callRoute('FLA3')

    expect(res.status).toBe(200)
    expect(mockResolve).toHaveBeenCalledWith('FLA3')
    expect(client.asset.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ticker: 'URU3' } }),
    )
    expect(body.data.ticker).toBe('URU3')
    expect(body.data.displayName).toBe('Uruguaiana FC')
  })

  test('o DTO tem exatamente os catorze campos do contrato, sem extra nem faltante', async () => {
    authAs('LENDA')
    seed({ position: { id: 'pos-1', quantity: 10, avgPrice: 50, status: 'OPEN' } })

    const { res, body } = await callRoute()

    expect(res.status).toBe(200)
    expect(SELL_PREVIEW_FIELDS).toHaveLength(14)
    expect(Object.keys(body.data).sort()).toEqual([...SELL_PREVIEW_FIELDS].sort())
  })

  test('usuario sem posicao recebe 200 com hasPosition false, zeros e avgPrice null', async () => {
    authAs('LENDA')
    seed({ position: null })

    const { res, body } = await callRoute()

    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({
      hasPosition: false,
      ownedQty: 0,
      reservedQty: 0,
      availableQty: 0,
      avgPrice: null,
      positionId: null,
      positionStatus: null,
    })
  })

  test('posicao fechada aparece como CLOSED, ainda em 200 e nunca 404', async () => {
    authAs('LENDA')
    seed({ position: null, closedPosition: { id: 'pos-old', status: 'CLOSED' } })

    const { res, body } = await callRoute()

    expect(res.status).toBe(200)
    expect(body.data.hasPosition).toBe(false)
    expect(body.data.positionId).toBe('pos-old')
    expect(body.data.positionStatus).toBe('CLOSED')
    expect(body.data.avgPrice).toBeNull()
  })

  test('posicao totalmente reservada devolve availableQty zero com posicao presente', async () => {
    authAs('LENDA')
    seed({
      position: { id: 'pos-1', quantity: 40, avgPrice: 12.5, status: 'OPEN' },
      sellOrders: [
        { quantity: 25, type: 'LIMIT', groupId: null },
        { quantity: 15, type: 'STOP', groupId: null },
      ],
    })

    const { res, body } = await callRoute()

    expect(res.status).toBe(200)
    expect(body.data.ownedQty).toBe(40)
    expect(body.data.reservedQty).toBe(40)
    expect(body.data.availableQty).toBe(0)
    expect(body.data.hasPosition).toBe(true)
    expect(body.data.avgPrice).toBe(12.5)
  })

  test('OCO do mesmo grupo reserva a quantidade uma unica vez', async () => {
    authAs('LENDA')
    seed({
      position: { id: 'pos-1', quantity: 30, avgPrice: 10, status: 'OPEN' },
      sellOrders: [
        { quantity: 10, type: 'OCO', groupId: 'g-1' },
        { quantity: 10, type: 'OCO', groupId: 'g-1' },
      ],
    })

    const { body } = await callRoute()

    expect(body.data.reservedQty).toBe(10)
    expect(body.data.availableQty).toBe(20)
  })

  const PLANS: PlanType[] = ['JOGADOR', 'CRAQUE', 'LENDA']

  test.each(PLANS)(
    'plano %s: priceDelayMinutes e isPriceDelayed derivam de getDelaySeconds',
    async (planType) => {
      authAs(planType)
      seed({ position: { id: 'pos-1', quantity: 5, avgPrice: 20, status: 'OPEN' } })

      const { res, body } = await callRoute()

      expect(res.status).toBe(200)
      expect(body.data.priceDelayMinutes).toBe(getDelaySeconds(planType) / 60)
      expect(body.data.isPriceDelayed).toBe(getDelaySeconds(planType) > 0)
    },
  )

  test('JOGADOR e CRAQUE recebem o preco historico, LENDA o preco corrente', async () => {
    // Historico semeado em 90; preco corrente do ativo em 100.
    authAs('JOGADOR')
    seed({ position: { id: 'pos-1', quantity: 5, avgPrice: 20, status: 'OPEN' } })
    const atrasado = await callRoute()
    expect(atrasado.body.data.currentPrice).toBe(90)
    expect(atrasado.body.data.currentPriceAsOf).toBe('2026-08-24T11:00:00.000Z')

    jest.clearAllMocks()
    mockResolve.mockImplementation((t: string) => Promise.resolve(t.toUpperCase()))
    authAs('LENDA')
    seed({ position: { id: 'pos-1', quantity: 5, avgPrice: 20, status: 'OPEN' } })
    const tempoReal = await callRoute()
    expect(tempoReal.body.data.currentPrice).toBe(100)
  })

  test('503 PRICE_BUFFERING quando o buffer de delay ainda nao tem historico', async () => {
    authAs('JOGADOR')
    seed({
      position: { id: 'pos-1', quantity: 5, avgPrice: 20, status: 'OPEN' },
      history: [],
    })

    const { res, body } = await callRoute()

    expect(res.status).toBe(503)
    expect(body.error.code).toBe('PRICE_BUFFERING')
    // Sem fallback para preco real: nenhum preco vaza no corpo do erro.
    expect(JSON.stringify(body)).not.toContain('100')
  })

  test('500 SYS-001 quando a leitura do ativo falha', async () => {
    authAs('LENDA')
    client.asset.findUnique.mockRejectedValue(new Error('db down'))
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})

    const { res, body } = await callRoute()

    expect(res.status).toBe(500)
    expect(body.error.code).toBe('SYS-001')
    consoleError.mockRestore()
  })

  test('a rota nunca le Asset.currentPrice fora do argumento de applyPriceDelay', () => {
    const routePath = path.join(
      process.cwd(),
      'src/app/api/v1/positions/[ticker]/sell-preview/route.ts',
    )
    const source = fs.readFileSync(routePath, 'utf8')

    // Uma unica leitura de asset.currentPrice em todo o arquivo...
    const leituras = source.match(/asset\.currentPrice/g) ?? []
    expect(leituras).toHaveLength(1)

    // ...e ela esta dentro da chamada de applyPriceDelay.
    const inicio = source.indexOf('await applyPriceDelay(')
    expect(inicio).toBeGreaterThan(-1)
    const fim = source.indexOf('\n    )', inicio)
    expect(fim).toBeGreaterThan(inicio)
    expect(source.slice(inicio, fim)).toContain('asset.currentPrice')

    // O campo currentPrice do DTO vem exclusivamente da saida do delay.
    expect(source).toContain('currentPrice: delayed.currentPrice')
  })
})
