/**
 * Testes de integracao — item 007 / T-06 do loop
 * 08-18-foot-stock-motor-noticias-analise:
 * tornar visivel o rascunho criado no admin.
 *
 * O GET admin ordenava por `publishedAt desc nulls last`, entao rascunhos
 * (publishedAt null) nasciam fora da janela de 100 grupos quando o acervo
 * tinha mais de 100 grupos publicados. O fix ordena por `createdAt desc`.
 *
 * A suite mocka `@/lib/prisma` e `@/lib/auth` para nao precisar de banco real.
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

const findManyNews = jest.fn()
// T-08: o GET conta as ancoras em quarentena na mesma requisicao da listagem.
const countNews = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    news: {
      findMany: (...a: unknown[]) => findManyNews(...a),
      count: (...a: unknown[]) => countNews(...a),
    },
  },
}))

import { getAuthUser } from '@/lib/auth'
import { GET as adminNewsGET } from '@/app/api/v1/admin/news/route'

const mockGetAuthUser = getAuthUser as jest.Mock

const AUTH = {
  user: { id: 'u1', name: 'Editor', email: 'e@t.com', adminRole: 'EDITOR' },
  userId: 'u1',
}

function adminListReq(): NextRequest {
  return {} as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetAuthUser.mockResolvedValue(AUTH)
  countNews.mockResolvedValue(0)
})

// ---------------------------------------------------------------------------
// T-06 — rascunho visivel no topo do admin
// ---------------------------------------------------------------------------

describe('T-06 — rascunho recem-criado aparece no topo do admin', () => {
  test('com mais de 100 grupos publicados, rascunho e o primeiro item retornado', async () => {
    const now = new Date('2026-08-19T12:00:00.000Z')
    const yesterday = new Date('2026-08-18T10:00:00.000Z')

    // 101 grupos publicados (publishedAt preenchido, isPublished true).
    const publishedAnchors = Array.from({ length: 101 }, (_, i) => ({
      id: `pub-${i}`,
      groupId: `g-pub-${i}`,
      groupRank: 0,
      isPublished: true,
      publishedAt: yesterday,
      createdAt: yesterday,
      ticker: 'FLA',
      title: `Publicada ${i}`,
    }))

    // 1 rascunho com createdAt mais recente que todas as publicadas.
    const draftAnchor = {
      id: 'draft-1',
      groupId: 'g-draft-1',
      groupRank: 0,
      isPublished: false,
      publishedAt: null,
      createdAt: now,
      ticker: 'PAL',
      title: 'Rascunho recente',
    }

    // A ordenacao por createdAt desc deve colocar o rascunho primeiro.
    const anchors = [draftAnchor, ...publishedAnchors]

    // Primeira chamada: ancoras. Segunda chamada: hidratacao de irmaos (vazio).
    findManyNews.mockResolvedValueOnce(anchors).mockResolvedValueOnce([])

    const res = await adminNewsGET(adminListReq())
    const body = await res.json()

    // A rota faz duas chamadas: ancoras + irmaos.
    expect(findManyNews).toHaveBeenCalledTimes(2)

    const listArg = findManyNews.mock.calls[0][0] as {
      where: Record<string, unknown>
      orderBy: Record<string, unknown>
      take: number
    }

    // O fix: ordenacao do admin por createdAt desc. O `where` ganhou
    // `editorialBlockReason: null` no T-08 (quarentena oculta por default);
    // T-06 continua sendo o `orderBy`.
    expect(listArg.where).toEqual({ groupRank: 0, editorialBlockReason: null })
    expect(listArg.orderBy).toEqual({ createdAt: 'desc' })
    expect(listArg.take).toBe(100)

    // O mock nao aplica `take`, entao todos os 102 ancoras sao retornados;
    // o importante e que o rascunho esteja no topo por causa do orderBy.
    expect(body.data).toHaveLength(102)
    expect(body.data[0].id).toBe('draft-1')
    expect(body.data[0].isPublished).toBe(false)

    // Todas as demais sao publicadas.
    expect(body.data.slice(1).every((n: { isPublished: boolean }) => n.isPublished)).toBe(true)
  })

  test('rascunho sem publicacao nao some mesmo com acervo grande', async () => {
    const now = new Date('2026-08-19T12:00:00.000Z')
    const oldDate = new Date('2026-07-01T10:00:00.000Z')

    // 50 publicadas antigas + 1 rascunho novo.
    const anchors = [
      {
        id: 'draft-only',
        groupId: 'g-draft-only',
        groupRank: 0,
        isPublished: false,
        publishedAt: null,
        createdAt: now,
        ticker: 'VAS',
        title: 'Rascunho unico',
      },
      ...Array.from({ length: 50 }, (_, i) => ({
        id: `old-${i}`,
        groupId: `g-old-${i}`,
        groupRank: 0,
        isPublished: true,
        publishedAt: oldDate,
        createdAt: oldDate,
        ticker: 'FLA',
        title: `Antiga ${i}`,
      })),
    ]

    findManyNews.mockResolvedValueOnce(anchors).mockResolvedValueOnce([])

    const res = await adminNewsGET(adminListReq())
    const body = await res.json()

    expect(body.data[0].id).toBe('draft-only')
    expect(body.data[0].isPublished).toBe(false)
  })
})
