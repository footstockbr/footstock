/**
 * Testes unitarios — T-19 (item 020 do loop 08-18-foot-stock-motor-noticias-analise):
 * validacao do ticker principal no POST /admin/news.
 *
 * Cobre os tres casos de aceite:
 *   1. POST com ticker invalido (sem Asset correspondente) retorna 422 NEWS-004.
 *   2. POST com ticker valido em minusculas grava normalizado (uppercase) e com assetIds preenchido.
 *   3. POST com ticker valido em maiusculas grava normalizado e com assetIds preenchido.
 *
 * Padrao de mock: mesmo setup de `admin-news-group-safe-route.test.ts`.
 * `@/lib/prisma` e mockado por completo; cada caso asserta o ARGUMENTO enviado ao Prisma.
 */

import type { NextRequest } from 'next/server'

// --- mocks -----------------------------------------------------------------

jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
  hasAdminRole: () => true,
}))

jest.mock('@/app/api/middleware', () => ({
  withAdmin: () => (handler: unknown) => handler,
}))

jest.mock('@/lib/utils/resolve-ticker', () => ({
  resolveTickerFromTitle: jest.fn(),
  resolveTickerFromText: jest.fn(),
}))

const findUniqueNews = jest.fn()
const createNews = jest.fn()
const findUniqueAsset = jest.fn()

const transaction = jest.fn(async (arg: unknown) => {
  if (typeof arg === 'function') {
    return (arg as (tx: unknown) => Promise<unknown>)({
      news: {
        create: (...a: unknown[]) => createNews(...a),
        update: (...a: unknown[]) => findUniqueNews(...a),
      },
    })
  }
  return Promise.all(arg as unknown[])
})

jest.mock('@/lib/prisma', () => ({
  prisma: {
    news: {
      findUnique: (...a: unknown[]) => findUniqueNews(...a),
      create: (...a: unknown[]) => createNews(...a),
    },
    asset: {
      findUnique: (...a: unknown[]) => findUniqueAsset(...a),
    },
    $transaction: (...a: unknown[]) => transaction(a[0]),
  },
}))

jest.mock('@/lib/services/newsGroupWriter', () => ({
  writeNewsGroup: jest.fn(async () => ({
    anchor: { id: 'n-anchor', groupId: 'n-anchor', groupRank: 0 },
  })),
}))

import { getAuthUser } from '@/lib/auth'
import { POST as adminNewsPOST } from '@/app/api/v1/admin/news/route'

const mockGetAuthUser = getAuthUser as jest.Mock

const AUTH = {
  user: { id: 'u1', name: 'Editor', email: 'e@t.com', adminRole: 'EDITOR' },
  userId: 'u1',
}

function postReq(body: unknown): NextRequest {
  return { json: async () => body, cookies: { get: () => undefined } } as unknown as NextRequest
}

const BASE_BODY = {
  title: 'Noticia de teste com tamanho suficiente',
  content: 'Conteudo de teste com tamanho suficiente para validar.',
  impact: 'ESPORTIVA_MAJORITARIA' as const,
  sentiment: 'BULLISH' as const,
  isPublished: false,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
  createNews.mockResolvedValue({ id: 'n1', groupId: 'n1', groupRank: 0 })
})

// ---------------------------------------------------------------------------
// T-19 — validacao do ticker principal no POST
// ---------------------------------------------------------------------------

describe('T-19 — validacao do ticker principal no POST /admin/news', () => {
  test('caso 1: ticker invalido (sem Asset) retorna 422 NEWS-004', async () => {
    findUniqueAsset.mockResolvedValue(null)

    const res = await adminNewsPOST(postReq({ ...BASE_BODY, ticker: 'XXXXX' }))
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error.code).toBe('NEWS-004')
    expect(body.error.message).toContain('Ticker invalido')
    expect(createNews).not.toHaveBeenCalled()
  })

  test('caso 2: ticker valido em minusculas grava normalizado (uppercase) e com assetIds', async () => {
    findUniqueAsset.mockResolvedValue({ id: 'asset-fla' })

    const res = await adminNewsPOST(postReq({ ...BASE_BODY, ticker: 'fla' }))
    const body = await res.json()

    expect(res.status).toBe(201)

    // Asset buscado com ticker uppercase
    expect(findUniqueAsset).toHaveBeenCalledWith({
      where: { ticker: 'FLA' },
      select: { id: true },
    })

    // Create gravou ticker uppercase e assetIds preenchido
    expect(createNews).toHaveBeenCalledTimes(1)
    const data = (createNews.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data.ticker).toBe('FLA')
    expect(data.assetIds).toEqual(['asset-fla'])
  })

  test('caso 3: ticker valido em maiusculas grava normalizado e com assetIds', async () => {
    findUniqueAsset.mockResolvedValue({ id: 'asset-ptr' })

    const res = await adminNewsPOST(postReq({ ...BASE_BODY, ticker: 'PTR' }))
    const body = await res.json()

    expect(res.status).toBe(201)

    expect(findUniqueAsset).toHaveBeenCalledWith({
      where: { ticker: 'PTR' },
      select: { id: true },
    })

    expect(createNews).toHaveBeenCalledTimes(1)
    const data = (createNews.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data.ticker).toBe('PTR')
    expect(data.assetIds).toEqual(['asset-ptr'])
  })

  test('ticker invalido em minusculas tambem retorna 422 NEWS-004 (normalizacao antes da validacao)', async () => {
    findUniqueAsset.mockResolvedValue(null)

    const res = await adminNewsPOST(postReq({ ...BASE_BODY, ticker: 'xxxxx' }))
    const body = await res.json()

    expect(res.status).toBe(422)
    expect(body.error.code).toBe('NEWS-004')

    // Asset foi buscado com uppercase (prova que a normalizacao aconteceu antes da validacao)
    expect(findUniqueAsset).toHaveBeenCalledWith({
      where: { ticker: 'XXXXX' },
      select: { id: true },
    })
    expect(createNews).not.toHaveBeenCalled()
  })

  test('ticker vazio (default) nao dispara NEWS-004 (sem validacao quando ausente)', async () => {
    // ticker ausente -> auto-detect retorna null -> resolvedTicker = null -> sem gate NEWS-004
    const res = await adminNewsPOST(postReq({ ...BASE_BODY }))

    expect(res.status).toBe(201)
    expect(findUniqueAsset).not.toHaveBeenCalled()
    expect(createNews).toHaveBeenCalledTimes(1)
    const data = (createNews.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data.ticker).toBeNull()
    expect(data.assetIds).toEqual([])
  })
})
