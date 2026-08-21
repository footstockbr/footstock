/**
 * @jest-environment jsdom
 *
 * T-24b / item 033: rotulo Fallback no card alcancavel de /admin/noticias.
 * A pagina consome o JSON do GET; este teste nao bate em Prisma nem na rota.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}))

import AdminNoticiasPage from '@/app/admin/noticias/page'

const FALLBACK_HINT =
  'Classificacao degradada: o classificador caiu no fallback deterministico.'

const BASE_ITEM = {
  id: 'n-fb-1',
  groupId: 'g-fb-1',
  groupRank: 0,
  title: 'Manchete com dois clubes',
  content: 'corpo',
  impact: 'ESPORTIVA_MAJORITARIA',
  sentiment: 'NEUTRAL',
  ticker: 'FLA',
  assetIds: [] as string[],
  isPublished: true,
  isArchived: false,
  editorialBlockReason: null,
  createdAt: '2026-08-18T10:00:00.000Z',
  publishedAt: '2026-08-18T10:00:00.000Z',
  clicks: 0,
  author: 'admin',
  updatedAt: '2026-08-18T10:00:00.000Z',
}

function newsResponse(item: Record<string, unknown>) {
  return {
    ok: true,
    headers: { get: () => null },
    json: async () => ({
      data: [item],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1, hasNext: false },
    }),
  }
}

function mockFetch(item: Record<string, unknown>) {
  const fetchMock = jest.fn().mockResolvedValue(newsResponse(item))
  ;(global as unknown as { fetch: unknown }).fetch = fetchMock
  return fetchMock
}

async function waitCard() {
  return screen.findByTestId('admin-noticias-card-n-fb-1')
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('T-24b — badge Fallback no card de /admin/noticias', () => {
  test('GET com teams[].origin classifier_fallback mostra Fallback e o motivo no title', async () => {
    mockFetch({
      ...BASE_ITEM,
      teams: [
        {
          id: 'n-fb-1',
          ticker: 'FLA',
          assetIds: [],
          sentiment: 'NEUTRAL',
          impact: 'ESPORTIVA_MAJORITARIA',
          groupRank: 0,
          origin: 'classifier_fallback',
          fallbackReason: 'parse_invalid',
        },
      ],
    })

    render(<AdminNoticiasPage />)
    await waitCard()

    const badge = await screen.findByTestId('admin-noticias-fallback-badge-n-fb-1')
    expect(badge.textContent).toBe('Fallback')
    expect(badge.getAttribute('title')).toBe('parse_invalid')
  })

  test('GET sem origin de fallback nao renderiza o badge nem texto Fallback', async () => {
    mockFetch({
      ...BASE_ITEM,
      origin: 'classifier',
      fallbackReason: null,
      teams: [
        {
          id: 'n-fb-1',
          ticker: 'FLA',
          assetIds: [],
          sentiment: 'NEUTRAL',
          impact: 'ESPORTIVA_MAJORITARIA',
          groupRank: 0,
          origin: 'classifier',
          fallbackReason: null,
        },
      ],
    })

    render(<AdminNoticiasPage />)
    const card = await waitCard()

    expect(screen.queryByTestId('admin-noticias-fallback-badge-n-fb-1')).toBeNull()
    expect(card.textContent).not.toContain('Fallback')
  })

  test('GET com classifier_fallback e fallbackReason null usa o hint fixo no title', async () => {
    mockFetch({
      ...BASE_ITEM,
      origin: 'classifier_fallback',
      fallbackReason: null,
      teams: [
        {
          id: 'n-fb-1',
          ticker: 'FLA',
          assetIds: [],
          sentiment: 'NEUTRAL',
          impact: 'ESPORTIVA_MAJORITARIA',
          groupRank: 0,
          origin: 'classifier_fallback',
          fallbackReason: null,
        },
      ],
    })

    render(<AdminNoticiasPage />)
    await waitCard()

    const badge = await screen.findByTestId('admin-noticias-fallback-badge-n-fb-1')
    expect(badge.textContent).toBe('Fallback')
    expect(badge.getAttribute('title')).toBe(FALLBACK_HINT)
    expect(badge.getAttribute('title')).not.toBe('')
  })
})
