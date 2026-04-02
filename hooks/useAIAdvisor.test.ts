// ============================================================================
// Foot Stock — useAIAdvisor Tests (module-21/TASK-3/ST001)
// Cobre: análise 200, 429, 403, ticker undefined, header remaining
// ============================================================================

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAIAdvisor } from './useAIAdvisor'
import type { AIAnalysis } from '@/lib/types/ai'

// ─── Mock: fetch global ───────────────────────────────────────────────────────

const mockFetch = jest.fn()
global.fetch = mockFetch

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TICKER = 'FLAM3'

const BASE_ANALYSIS: AIAnalysis = {
  ticker: TICKER,
  resumo: 'Análise completa do ativo.',
  pontos_positivos: ['Elenco forte'],
  pontos_negativos: ['Dívida alta'],
  sentimento: 0.4,
  recomendacao: 'COMPRAR',
  risco: 'MEDIO',
  noticias_relevantes: ['Clube fecha patrocínio'],
  generatedAt: new Date().toISOString(),
  isWebSearched: false,
  cached: false,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHeaders(entries: Record<string, string> = {}): Headers {
  const h = new Headers()
  for (const [k, v] of Object.entries(entries)) {
    h.set(k, v)
  }
  return h
}

function makeQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { Wrapper, queryClient }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useAIAdvisor', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── 200 → data populada, isLoading false ──────────────────────────────────

  it('resposta 200: data populada, isLoading=false, isRateLimited=false, isPlanGated=false', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: makeHeaders({ 'X-RateLimit-Remaining': '7' }),
      json: async () => ({ data: BASE_ANALYSIS }),
    })

    const { Wrapper } = makeQueryWrapper()
    const { result } = renderHook(() => useAIAdvisor(TICKER), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).toEqual(BASE_ANALYSIS)
    expect(result.current.isRateLimited).toBe(false)
    expect(result.current.isPlanGated).toBe(false)
    expect(result.current.isError).toBe(false)
    expect(result.current.error).toBeNull()
  })

  // ── 429 → isRateLimited=true, resetAt extraído do header ─────────────────

  it('resposta 429: isRateLimited=true, resetAt extraído do header X-RateLimit-Reset', async () => {
    const resetAt = 1_700_001_000
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: makeHeaders({ 'X-RateLimit-Reset': String(resetAt) }),
      json: async () => ({}),
    })

    const { Wrapper } = makeQueryWrapper()
    const { result } = renderHook(() => useAIAdvisor(TICKER), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isRateLimited).toBe(true)
    expect(result.current.resetAt).toBe(resetAt)
    expect(result.current.isPlanGated).toBe(false)
    expect(result.current.data).toBeUndefined()
    // 429 não lança exceção — não é isError
    expect(result.current.isError).toBe(false)
  })

  // ── 403 → isPlanGated=true ────────────────────────────────────────────────

  it('resposta 403: isPlanGated=true, isRateLimited=false, data=undefined', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: makeHeaders(),
      json: async () => ({}),
    })

    const { Wrapper } = makeQueryWrapper()
    const { result } = renderHook(() => useAIAdvisor(TICKER), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isPlanGated).toBe(true)
    expect(result.current.isRateLimited).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(result.current.isError).toBe(false)
  })

  // ── ticker undefined → enabled=false, fetch não chamado ──────────────────

  it('ticker=undefined: query desabilitada, fetch não é chamado', async () => {
    const { Wrapper } = makeQueryWrapper()
    const { result } = renderHook(() => useAIAdvisor(undefined), { wrapper: Wrapper })

    // Aguarda um tick para garantir que query ficou estável
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockFetch).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
    expect(result.current.isRateLimited).toBe(false)
    expect(result.current.isPlanGated).toBe(false)
  })

  // ── remaining extraído do header 200 ─────────────────────────────────────

  it('resposta 200 com X-RateLimit-Remaining=3: header é lido sem erros', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: makeHeaders({ 'X-RateLimit-Remaining': '3' }),
      json: async () => ({ data: BASE_ANALYSIS }),
    })

    const { Wrapper } = makeQueryWrapper()
    const { result } = renderHook(() => useAIAdvisor(TICKER), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    // O hook retorna os dados corretamente — o remaining é consumido pelo chamador
    expect(result.current.data).toEqual(BASE_ANALYSIS)
    expect(result.current.isError).toBe(false)
  })

  // ── 429 sem header X-RateLimit-Reset → resetAt=0 ─────────────────────────

  it('resposta 429 sem header X-RateLimit-Reset: resetAt=0', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: makeHeaders(), // sem X-RateLimit-Reset
      json: async () => ({}),
    })

    const { Wrapper } = makeQueryWrapper()
    const { result } = renderHook(() => useAIAdvisor(TICKER), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isRateLimited).toBe(true)
    expect(result.current.resetAt).toBe(0)
  })

  // ── Erro de rede (5xx) → isError=true ────────────────────────────────────

  it('resposta 500: isError=true, error tem mensagem extraída do body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: makeHeaders(),
      json: async () => ({ error: { message: 'Internal Server Error' } }),
    })

    const { Wrapper } = makeQueryWrapper()
    const { result } = renderHook(() => useAIAdvisor(TICKER), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isError).toBe(true)
    expect(result.current.error?.message).toBe('Internal Server Error')
  })

  // ── refetch está disponível como função ───────────────────────────────────

  it('refetch é uma função disponível no resultado do hook', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: makeHeaders(),
      json: async () => ({ data: BASE_ANALYSIS }),
    })

    const { Wrapper } = makeQueryWrapper()
    const { result } = renderHook(() => useAIAdvisor(TICKER), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(typeof result.current.refetch).toBe('function')
  })
})
