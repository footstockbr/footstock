import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NewsStatusToggle, requestNewsStatusChange } from '@/components/admin/NewsStatusToggle'

// F020-R1 (item 020): trava do verbo do switch de status. Depois do DB-23 o
// `DELETE /api/v1/admin/news/[id]` apaga FISICAMENTE o grupo inteiro (deleteMany por
// group_id, ate 3 linhas irmas) e nao existe caminho de volta — reintroduzir DELETE
// aqui destroi dado em definitivo a partir de um clique de "arquivar".
//
// O harness deste repo roda em `testEnvironment: 'node'` (jest.config.ts): sem jsdom
// nao ha clique para disparar, entao os dois sentidos sao exercitados pela funcao de
// fetch que o handler chama, com o `fetch` GLOBAL mockado — o mesmo caminho que roda
// em producao, sem injecao de dependencia que mascare o verbo real.
describe('requestNewsStatusChange', () => {
  const originalFetch = global.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 })
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  test('alternar o status nos dois sentidos nunca emite DELETE', async () => {
    await requestNewsStatusChange('news-1', 'archived')
    await requestNewsStatusChange('news-1', 'published')

    const methods = fetchMock.mock.calls.map(([, init]) => (init as RequestInit | undefined)?.method)

    expect(methods).toHaveLength(2)
    expect(methods).not.toContain('DELETE')
    // PUT tambem esta fora: a rota so exporta PATCH e DELETE, entao o antigo ramo de
    // restore respondia 405.
    expect(methods).not.toContain('PUT')
    expect(methods).toEqual(['PATCH', 'PATCH'])
  })

  test('arquivar despublica o grupo em vez de apaga-lo', async () => {
    await requestNewsStatusChange('news-42', 'archived')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/news/news-42',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: false }),
      })
    )
  })

  test('publicar reverte exatamente a mesma escrita', async () => {
    await requestNewsStatusChange('news-42', 'published')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/news/news-42',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: true }),
      })
    )
  })

  test('a URL alvo e a da linha, sem sufixo de rota destrutiva', async () => {
    await requestNewsStatusChange('news-42', 'archived')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/admin/news/news-42')
  })
})

describe('NewsStatusToggle', () => {
  test('renderiza o switch com o rotulo coerente com o status atual', () => {
    const published = renderToStaticMarkup(
      <NewsStatusToggle newsId="news-1" currentStatus="published" onToggle={() => {}} />
    )
    expect(published).toContain('role="switch"')
    expect(published).toContain('aria-checked="true"')
    expect(published).toContain('aria-label="Arquivar notícia"')

    const archived = renderToStaticMarkup(
      <NewsStatusToggle newsId="news-1" currentStatus="archived" onToggle={() => {}} />
    )
    expect(archived).toContain('aria-checked="false"')
    expect(archived).toContain('aria-label="Publicar notícia"')
  })
})
