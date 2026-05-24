// ============================================================================
// Testes unitários — POST /api/v1/admin/news/batch-resolve
// Rastreabilidade: task-008 (extensao batch-resolve), QA gaps G-04 + G-06
// ============================================================================
import { NextRequest } from 'next/server'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetAuthUser = jest.fn()
const mockHasAdminRole = jest.fn()
const mockNewsFindMany = jest.fn()
const mockAssetFindUnique = jest.fn()
const mockNewsUpdate = jest.fn()
const mockResolveTicker = jest.fn()

jest.mock('@/lib/auth', () => ({
  getAuthUser: (...args: unknown[]) => mockGetAuthUser(...args),
  hasAdminRole: (...args: unknown[]) => mockHasAdminRole(...args),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    news: {
      findMany: (...args: unknown[]) => mockNewsFindMany(...args),
      update: (...args: unknown[]) => mockNewsUpdate(...args),
    },
    asset: {
      findUnique: (...args: unknown[]) => mockAssetFindUnique(...args),
    },
  },
}))

jest.mock('@/lib/utils/resolve-ticker', () => ({
  resolveTickerFromText: (...args: unknown[]) => mockResolveTicker(...args),
}))

import { POST } from '@/app/api/v1/admin/news/batch-resolve/route'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SUPER_ADMIN_AUTH = {
  user: {
    id: 'admin-001',
    email: 'admin@foot-stock.test',
    name: 'Super Admin',
    adminRole: 'SUPER_ADMIN',
    phone: null, birthDate: '', favoriteClub: '', favoriteClubDisplayName: null,
    userType: 'NORMAL', investorProfile: 'INICIANTE', planType: 'JOGADOR',
    fsBalance: 0, marginBlocked: 0, tourCompleted: false, ageVerificationPending: false,
    version: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  supabaseId: 'admin-001',
}

const NEWS_STUB = (id: string) => ({
  id,
  title: `Flamengo vence ${id}`,
  content: 'Conteudo de teste.',
})

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/v1/admin/news/batch-resolve', {
    method: 'POST',
  })
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/admin/news/batch-resolve', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Defaults: autenticado como SUPER_ADMIN
    mockGetAuthUser.mockResolvedValue(SUPER_ADMIN_AUTH)
    mockHasAdminRole.mockReturnValue(true)
    mockNewsFindMany.mockResolvedValue([])
    mockAssetFindUnique.mockResolvedValue(null)
    mockNewsUpdate.mockResolvedValue({})
    mockResolveTicker.mockResolvedValue(null)
  })

  // ─── Autenticacao e autorizacao ─────────────────────────────────────────

  test('[AUTH] sem autenticacao → 401', async () => {
    mockGetAuthUser.mockResolvedValue(null)

    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  test('[AUTHZ] usuario autenticado mas nao SUPER_ADMIN → 403', async () => {
    mockHasAdminRole.mockReturnValue(false)

    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
  })

  // ─── Sem noticias pendentes ─────────────────────────────────────────────

  test('[EMPTY] sem noticias sem ticker → retorna zeros sem chamar update', async () => {
    mockNewsFindMany.mockResolvedValue([])

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      total: 0,
      resolved: 0,
      resolved_with_asset: 0,
      no_asset_match: 0,
      remaining: 0,
      failed: 0,
    })
    expect(mockNewsUpdate).not.toHaveBeenCalled()
  })

  // ─── Resolucao com asset ────────────────────────────────────────────────

  test('[SUCCESS] ticker e assetId resolvidos → resolved_with_asset incrementado', async () => {
    mockNewsFindMany.mockResolvedValue([NEWS_STUB('n1'), NEWS_STUB('n2')])
    mockResolveTicker.mockResolvedValue('URU3')
    mockAssetFindUnique.mockResolvedValue({ id: 'asset-uuid-fla' })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(body.data.resolved).toBe(2)
    expect(body.data.resolved_with_asset).toBe(2)
    expect(body.data.no_asset_match).toBe(0)
    expect(body.data.remaining).toBe(0)
    expect(body.data.failed).toBe(0)

    expect(mockNewsUpdate).toHaveBeenCalledTimes(2)
    expect(mockNewsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticker: 'URU3',
          assetIds: ['asset-uuid-fla'],
        }),
      })
    )
  })

  test('[EDGE] ticker resolvido mas Asset nao encontrado → resolved++ sem assetIds update', async () => {
    mockNewsFindMany.mockResolvedValue([NEWS_STUB('n1')])
    mockResolveTicker.mockResolvedValue('URU3')
    mockAssetFindUnique.mockResolvedValue(null)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(body.data.resolved).toBe(1)
    expect(body.data.resolved_with_asset).toBe(0)
    expect(body.data.no_asset_match).toBe(1)

    // Grava ticker mas nao assetIds (spread vazio)
    expect(mockNewsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ticker: 'URU3' },
      })
    )
  })

  test('[EDGE] ticker nao resolvido → news ignorada, remaining incrementado', async () => {
    mockNewsFindMany.mockResolvedValue([NEWS_STUB('n1'), NEWS_STUB('n2')])
    mockResolveTicker
      .mockResolvedValueOnce('URU3')
      .mockResolvedValueOnce(null)
    mockAssetFindUnique.mockResolvedValue({ id: 'asset-uuid-fla' })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(body.data.total).toBe(2)
    expect(body.data.resolved).toBe(1)
    expect(body.data.remaining).toBe(1)
    expect(mockNewsUpdate).toHaveBeenCalledTimes(1)
  })

  // ─── Resiliencia (G-04) ─────────────────────────────────────────────────

  test('[RESILIENCE] exception em prisma.news.update nao interrompe loop — failed++ e loop continua', async () => {
    mockNewsFindMany.mockResolvedValue([NEWS_STUB('n1'), NEWS_STUB('n2'), NEWS_STUB('n3')])
    mockResolveTicker.mockResolvedValue('URU3')
    mockAssetFindUnique.mockResolvedValue({ id: 'asset-uuid-fla' })
    // n2 falha; n1 e n3 passam
    mockNewsUpdate
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('DB constraint violation'))
      .mockResolvedValueOnce({})

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.resolved).toBe(2)
    expect(body.data.failed).toBe(1)
  })

  test('[RESILIENCE] exception em resolveTickerFromText nao interrompe loop', async () => {
    mockNewsFindMany.mockResolvedValue([NEWS_STUB('n1'), NEWS_STUB('n2')])
    mockResolveTicker
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockResolvedValueOnce('URU3')
    mockAssetFindUnique.mockResolvedValue({ id: 'asset-uuid-fla' })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.failed).toBe(1)
    expect(body.data.resolved).toBe(1)
  })

  // ─── Estrutura do response ──────────────────────────────────────────────

  test('[CONTRACT] response inclui todos os campos esperados pelo ADR', async () => {
    mockNewsFindMany.mockResolvedValue([NEWS_STUB('n1')])
    mockResolveTicker.mockResolvedValue('URU3')
    mockAssetFindUnique.mockResolvedValue({ id: 'asset-uuid-fla' })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(body.data).toHaveProperty('total')
    expect(body.data).toHaveProperty('resolved')
    expect(body.data).toHaveProperty('resolved_with_asset')
    expect(body.data).toHaveProperty('no_asset_match')
    expect(body.data).toHaveProperty('remaining')
    expect(body.data).toHaveProperty('failed')
  })
})
