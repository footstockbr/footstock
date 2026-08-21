/**
 * @jest-environment jsdom
 *
 * Testes de renderizacao — item 007 / T-06 criterio 3 do loop
 * 08-18-foot-stock-motor-noticias-analise.
 *
 * As suites de rota provam que os headers de contagem sao EMITIDOS; a suite do
 * modulo prova a decisao de qual numero exibir. Faltava a fiacao: nada provava
 * que a tela chega a LER os headers. Um `page.tsx` que ignorasse a resposta e
 * continuasse contando a pagina passaria em todas as outras suites e mostraria
 * de novo "0 rascunhos" para o operador, que e o defeito que originou o T-06.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}))

import AdminNoticiasPage from '@/app/admin/noticias/page'

/** Uma ancora publicada; e o unico item que a pagina 2 devolve nos casos abaixo. */
const ANCHOR = {
  id: 'n-1',
  groupId: 'g-1',
  groupRank: 0,
  title: 'Noticia da pagina 2',
  content: 'corpo',
  impact: 'ESPORTIVA_MAJORITARIA',
  sentiment: 'NEUTRAL',
  ticker: 'FLA',
  isPublished: true,
  isArchived: false,
  editorialBlockReason: null,
  createdAt: '2026-08-18T10:00:00.000Z',
  publishedAt: '2026-08-18T10:00:00.000Z',
}

/** Resposta no shape que a pagina consome: `ok`, `headers.get`, `json()`. */
function newsResponse(headerBag: Record<string, string>) {
  return {
    ok: true,
    headers: { get: (name: string) => (name in headerBag ? headerBag[name] : null) },
    json: async () => ({
      data: [ANCHOR],
      pagination: { page: 2, limit: 100, total: 102, totalPages: 2, hasNext: false },
    }),
  }
}

function mockFetchOnce(headerBag: Record<string, string>) {
  const fetchMock = jest.fn().mockResolvedValue(newsResponse(headerBag))
  ;(global as unknown as { fetch: unknown }).fetch = fetchMock
  return fetchMock
}

const ACERVO_HEADERS = {
  'X-Quarantine-Count': '0',
  'X-Published-Count': '101',
  'X-Draft-Count': '1',
  'X-Archived-Count': '0',
}

async function counterText(): Promise<string> {
  const el = await screen.findByTestId('admin-noticias-counters')
  await waitFor(() => expect(el.textContent).toBeTruthy())
  return el.textContent ?? ''
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('T-06 criterio 3 — o contador na tela vem do acervo', () => {
  test('com os headers, a tela mostra o rascunho que NAO esta nesta pagina', async () => {
    // A pagina renderizada tem 1 publicada e ZERO rascunhos. O acervo tem 1
    // rascunho. Antes do fix a tela dizia "0 rascunhos" — o sintoma do M12.
    mockFetchOnce(ACERVO_HEADERS)

    render(<AdminNoticiasPage />)

    const text = await waitFor(async () => {
      const t = await counterText()
      expect(t).toContain('No acervo')
      return t
    })

    // Linha inteira, nao substring: "101 publicadas" contem "1 publicadas", e um
    // `toContain` frouxo aqui passaria justamente no caso de regressao.
    expect(text).toBe('No acervo (quarentena oculta): 101 publicadas · 1 rascunhos · 0 arquivadas')
  })

  test('sem os headers, a tela conta a pagina e ADMITE que e a pagina', async () => {
    mockFetchOnce({ 'X-Quarantine-Count': '0' })

    render(<AdminNoticiasPage />)

    const text = await waitFor(async () => {
      const t = await counterText()
      expect(t).toContain('Nesta página')
      return t
    })

    // 1 publicada e o que veio na pagina; o rotulo impede que isso seja lido
    // como acervo. Degradar em silencio seria mentir com numero menor.
    expect(text).toContain('1 publicadas')
    expect(text).toContain('0 rascunhos')
  })

  test('com um header faltando, cai inteiro para a pagina, sem misturar', async () => {
    const { 'X-Archived-Count': _omitido, ...semArquivadas } = ACERVO_HEADERS
    mockFetchOnce(semArquivadas)

    render(<AdminNoticiasPage />)

    const text = await waitFor(async () => {
      const t = await counterText()
      expect(t).toContain('Nesta página')
      return t
    })

    // Nenhum numero do acervo pode sobrar na linha: 101 ao lado de 0 arquivadas
    // seria uma frase com dois denominadores.
    expect(text).not.toContain('101')
  })

  test('header de contagem ilegivel nao vira zero silencioso', async () => {
    mockFetchOnce({ ...ACERVO_HEADERS, 'X-Draft-Count': 'abc' })

    render(<AdminNoticiasPage />)

    const text = await waitFor(async () => {
      const t = await counterText()
      expect(t).toContain('Nesta página')
      return t
    })

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('X-Draft-Count'))
    expect(text).not.toContain('101')
  })
})
