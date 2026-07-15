import { NextRequest } from 'next/server'

const mockGetAuthUser = jest.fn()
const mockHasAdminRole = jest.fn()
const mockAssetFindMany = jest.fn()
const mockAssetUpdate = jest.fn()
const mockTransaction = jest.fn()
const mockAuditCreate = jest.fn()
const mockPipelinePublish = jest.fn()
const mockPipelineExec = jest.fn()
const mockPipeline = jest.fn(() => ({
  publish: mockPipelinePublish,
  exec: mockPipelineExec,
}))

jest.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
  hasAdminRole: (...args: unknown[]) => mockHasAdminRole(...args),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findMany: (...args: unknown[]) => mockAssetFindMany(...args),
      update: (...args: unknown[]) => mockAssetUpdate(...args),
    },
    adminMarketAction: {
      create: (...args: unknown[]) => mockAuditCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    pipeline: () => mockPipeline(),
  },
}))

import { POST } from '@/app/api/v1/admin/assets/reset-prices/route'

const SUPER_ADMIN_AUTH = {
  user: {
    id: 'superadmin-1',
    email: 'superadmin@foot-stock.test',
    adminRole: 'SUPER_ADMIN',
  },
}

function decimal(value: number) {
  return { toNumber: () => value }
}

function makeRequest(body: object = {}): NextRequest {
  return new NextRequest('http://localhost/api/v1/admin/assets/reset-prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/v1/admin/assets/reset-prices', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_AUTH)
    mockHasAdminRole.mockReturnValue(true)
    mockAssetUpdate.mockResolvedValue({})
    mockTransaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations))
    mockAuditCreate.mockResolvedValue({})
    mockPipelineExec.mockResolvedValue([])
  })

  test('exige autenticação', async () => {
    mockGetAuthUser.mockResolvedValue(null)

    const response = await POST(makeRequest({ variationPct: 0 }))

    expect(response.status).toBe(401)
    expect(mockAssetFindMany).not.toHaveBeenCalled()
  })

  test('rejeita qualquer role abaixo de SUPER_ADMIN', async () => {
    mockHasAdminRole.mockReturnValue(false)

    const response = await POST(makeRequest({ variationPct: 0 }))

    expect(response.status).toBe(403)
    expect(mockHasAdminRole).toHaveBeenCalledWith('SUPER_ADMIN', 'SUPER_ADMIN')
    expect(mockAssetFindMany).not.toHaveBeenCalled()
  })

  test('restaura todos os ativos exatamente para o fair value e sincroniza o motor', async () => {
    mockAssetFindMany
      .mockResolvedValueOnce([
        {
          id: 'asset-1',
          ticker: 'URU3',
          division: 'SERIE_A',
          currentPrice: decimal(31.25),
          fairValue: decimal(40),
          marketCap: decimal(312_500),
          currentSupply: BigInt(10_000),
        },
        {
          id: 'asset-invalid',
          ticker: 'INV3',
          division: 'SERIE_A',
          currentPrice: decimal(5),
          fairValue: decimal(0),
          marketCap: decimal(50_000),
          currentSupply: BigInt(10_000),
        },
      ])
      .mockResolvedValueOnce([{ id: 'asset-1', ticker: 'URU3' }])

    const response = await POST(
      makeRequest({ onlyFloored: false, variationPct: 0 })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.assetsUpdated).toBe(1)
    expect(body.data.changes[0]).toEqual(
      expect.objectContaining({ ticker: 'URU3', newPrice: 40, fairValue: 40, variationPct: 0 })
    )
    expect(mockAssetFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { isActive: true } })
    )
    expect(mockAssetUpdate).toHaveBeenCalledWith({
      where: { ticker: 'URU3' },
      data: expect.objectContaining({
        currentPrice: 40,
        closePrice: 40,
        marketCap: 400_000,
      }),
    })

    expect(mockPipelinePublish).toHaveBeenCalledTimes(1)
    const motorEvent = JSON.parse(mockPipelinePublish.mock.calls[0][1] as string)
    expect(motorEvent).toEqual(
      expect.objectContaining({
        type: 'ADJUST_PRICE',
        assetId: 'asset-1',
        adminId: 'superadmin-1',
        payload: { newPrice: 40 },
      })
    )
    expect(mockPipelineExec).toHaveBeenCalledTimes(1)
    expect(mockAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: 'superadmin-1',
        action: 'RESET_PRICES',
        details: expect.objectContaining({
          assetsUpdated: 1,
          motorEventsSent: 1,
          variationPct: 0,
        }),
      }),
    })
  })

  test('restringe o reset ao ticker solicitado', async () => {
    mockAssetFindMany
      .mockResolvedValueOnce([
        {
          id: 'asset-uru3',
          ticker: 'URU3',
          division: 'SERIE_A',
          currentPrice: decimal(35),
          fairValue: decimal(40),
          marketCap: decimal(350_000),
          currentSupply: BigInt(10_000),
        },
      ])
      .mockResolvedValueOnce([{ id: 'asset-uru3', ticker: 'URU3' }])

    const response = await POST(
      makeRequest({ ticker: ' uru3 ', onlyFloored: false, variationPct: 0 })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data.ticker).toBe('URU3')
    expect(body.data.assetsUpdated).toBe(1)
    expect(mockAssetFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { ticker: 'URU3' } })
    )
    expect(mockAssetUpdate).toHaveBeenCalledTimes(1)
    expect(mockAssetUpdate).toHaveBeenCalledWith(
      {
        where: { ticker: 'URU3' },
        data: expect.not.objectContaining({
          isHalted: expect.anything(),
          haltReason: expect.anything(),
          haltedUntil: expect.anything(),
        }),
      }
    )
  })

  test('rejeita filtro de ticker vazio', async () => {
    const response = await POST(makeRequest({ ticker: '   ', variationPct: 0 }))

    expect(response.status).toBe(422)
    expect(mockAssetFindMany).not.toHaveBeenCalled()
  })
})
