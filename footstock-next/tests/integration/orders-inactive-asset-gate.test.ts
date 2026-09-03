/**
 * B1 (09-02) — ordem em ativo DESATIVADO (`isActive = false`) e recusada na porta.
 *
 * Antes deste gate a ordem era aceita, nascia OPEN e ficava invisivel ao motor:
 * `MarketEngine.syncAssetRoster` chama `forgetAsset` para todo ativo com
 * `isActive=false`, entao ninguem precifica, ninguem casa e ninguem cancela — a
 * ordem so morre na expiracao de 30 dias, com o saldo do usuario reservado ate la.
 * Zero Silencio: `ASSET_033` (422) explicito e estritamente melhor que ordem presa.
 *
 * Segue o padrao das demais suites de `tests/integration/`: `@/lib/prisma`
 * mockado, sem banco real. O gate roda ANTES das 5 camadas de validacao, entao a
 * suite so precisa programar usuario + alias + ativo.
 */

const mockUserFindUnique = jest.fn()
const mockAssetFindUnique = jest.fn()
const mockOrderCreate = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    asset: { findUnique: (...a: unknown[]) => mockAssetFindUnique(...a) },
    order: { create: (...a: unknown[]) => mockOrderCreate(...a) },
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: { get: jest.fn(), set: jest.fn(), publish: jest.fn() },
}))

jest.mock('@/services/AliasService', () => ({
  AliasService: { resolve: jest.fn(async (t: string) => t) },
}))

import { orderService, AppError } from '@/lib/services/OrderService'

function decimal(value: number) {
  return { toNumber: () => value, toString: () => String(value) }
}

/** Usuario comum, plano pago — passa o gate de staff sem interferir no teste. */
function seedUser() {
  mockUserFindUnique.mockResolvedValue({
    id: 'user-1',
    userType: 'PLAYER',
    planType: 'LENDA',
    balance: decimal(100_000),
  })
}

function seedAsset(isActive: boolean) {
  mockAssetFindUnique.mockResolvedValue({
    id: 'asset-1',
    ticker: 'URU3',
    isActive,
    isHalted: false,
    haltReason: null,
    currentPrice: decimal(10),
  })
}

const dto = {
  ticker: 'URU3',
  type: 'LIMIT' as const,
  side: 'BUY' as const,
  quantity: 10,
  price: 10,
}

beforeEach(() => {
  jest.clearAllMocks()
  seedUser()
})

describe('B1 — createOrder recusa ativo desativado', () => {
  it('BUY em ativo desativado lanca ASSET_033 (422)', async () => {
    seedAsset(false)
    await expect(orderService.createOrder('user-1', dto)).rejects.toMatchObject({
      code: 'ASSET_033',
      statusCode: 422,
    })
  })

  it('SELL em ativo desativado tambem e recusada (trava do mesmo jeito)', async () => {
    seedAsset(false)
    await expect(
      orderService.createOrder('user-1', { ...dto, side: 'SELL' as const }),
    ).rejects.toMatchObject({ code: 'ASSET_033' })
  })

  it('a ordem NAO chega a ser criada — nenhum saldo fica reservado', async () => {
    seedAsset(false)
    await expect(orderService.createOrder('user-1', dto)).rejects.toBeInstanceOf(AppError)
    expect(mockOrderCreate).not.toHaveBeenCalled()
  })

  it('o gate roda ANTES das camadas de plano/halt/sessao/saldo', async () => {
    // Ativo desativado E em halt: o erro que sai e o do ativo desativado, nao o
    // ASSET_030 do circuit breaker. Fixa a ordem das camadas.
    mockAssetFindUnique.mockResolvedValue({
      id: 'asset-1',
      ticker: 'URU3',
      isActive: false,
      isHalted: true,
      haltReason: 'CIRCUIT_BREAKER',
      currentPrice: decimal(10),
    })
    await expect(orderService.createOrder('user-1', dto)).rejects.toMatchObject({
      code: 'ASSET_033',
    })
  })

  it('ativo ATIVO passa do gate (a recusa vem de outra camada, nunca ASSET_033)', async () => {
    seedAsset(true)
    // O fluxo segue e falha adiante (limite diario / sessao / saldo, com prisma
    // mockado incompleto). O que a suite trava e que ASSET_033 nao aparece.
    await expect(orderService.createOrder('user-1', dto)).rejects.not.toMatchObject({
      code: 'ASSET_033',
    })
  })
})
