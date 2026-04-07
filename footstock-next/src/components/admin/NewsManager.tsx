'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { Edit, ExternalLink, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Filter, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { NewsStatusToggle } from './NewsStatusToggle'
import { NewsForm } from './NewsForm'
import type { AdminNewsItem } from '@/lib/types/admin'

interface NewsFilters {
  fonte: string
  ticker: string
  sentiment: string
  status: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const SENTIMENT_LABELS: Record<string, string> = {
  positive: 'Positivo',
  negative: 'Negativo',
  neutral: 'Neutro',
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'success',
  negative: 'error',
  neutral: 'default',
}

export function NewsManager() {
  const [filters, setFilters] = useState<NewsFilters>({ fonte: '', ticker: '', sentiment: '', status: '' })
  const [page, setPage] = useState(1)
  const [editingNews, setEditingNews] = useState<AdminNewsItem | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const editModalRef = useRef<HTMLDivElement>(null)

  // Escape para fechar modal de edicao + body overflow hidden + focus trap
  useEffect(() => {
    if (!editingNews) return

    document.body.style.overflow = 'hidden'

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setEditingNews(null)
        return
      }
      if (e.key === 'Tab' && editModalRef.current) {
        const focusableEls = editModalRef.current.querySelectorAll<HTMLElement>(
          'input, select, textarea, button, [tabindex]:not([tabindex="-1"])'
        )
        const focusable = Array.from(focusableEls).filter((el) => !el.hasAttribute('disabled'))
        if (focusable.length === 0) return
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey) {
          e.preventDefault()
          const prev = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
          focusable[prev].focus()
        } else {
          e.preventDefault()
          const next = currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1
          focusable[next].focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // Foco no primeiro elemento focavel do modal
    requestAnimationFrame(() => {
      if (editModalRef.current) {
        const first = editModalRef.current.querySelector<HTMLElement>(
          'input, select, textarea, button'
        )
        first?.focus()
      }
    })

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [editingNews])

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) })
    if (filters.fonte) params.set('fonte', filters.fonte)
    if (filters.ticker) params.set('ticker', filters.ticker)
    if (filters.sentiment) params.set('sentiment', filters.sentiment)
    if (filters.status) params.set('status', filters.status)
    return `/api/v1/admin/news?${params}`
  }, [filters, page])

  const { data, error, isLoading, mutate } = useSWR(buildUrl(), fetcher, {
    keepPreviousData: true,
  })

  const items: AdminNewsItem[] = data?.data?.items ?? []
  const meta = data?.data?.meta ?? { totalPublished: 0, totalArchived: 0, classifiedToday: 0 }
  const pagination = {
    page: data?.data?.pagination?.page ?? 1,
    totalPages: data?.data?.pagination?.totalPages ?? 1,
    total: data?.data?.pagination?.total ?? 0,
  }

  function handleFilterChange(key: keyof NewsFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const selectClass = 'h-10 min-h-[44px] w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20] px-3 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]'

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4" aria-label="Resumo de notícias">
        <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.08)] p-3 text-center">
          <p className="text-lg font-bold text-[#4ade80]">{meta.totalPublished}</p>
          <p className="text-xs text-[#929AA5]">Publicadas</p>
        </div>
        <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.08)] p-3 text-center">
          <p className="text-lg font-bold text-[#929AA5]">{meta.totalArchived}</p>
          <p className="text-xs text-[#929AA5]">Arquivadas</p>
        </div>
        <div className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.08)] p-3 text-center">
          <p className="text-lg font-bold text-[#F0B90B]">{meta.classifiedToday}</p>
          <p className="text-xs text-[#929AA5]">Hoje</p>
        </div>
      </div>

      {/* Filtros — Mobile: accordion, Desktop: linha */}
      <div className="mb-4">
        {/* Mobile toggle */}
        <button
          className="flex md:hidden items-center gap-2 text-sm text-[#929AA5] hover:text-[#F0B90B] mb-2 min-h-[44px]"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
        >
          <Filter className="h-4 w-4" />
          Filtros
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>

        <div className={`grid grid-cols-1 gap-2 md:grid md:grid-cols-4 md:gap-3 ${filtersOpen ? 'grid' : 'hidden md:grid'}`}>
          <select
            value={filters.fonte}
            onChange={(e) => handleFilterChange('fonte', e.target.value)}
            aria-label="Filtrar por fonte"
            className={selectClass}
          >
            <option value="">Todas as fontes</option>
            <option value="ADMIN_MANUAL">Injeção Manual</option>
            <option value="RSS">RSS</option>
          </select>
          <input
            type="text"
            value={filters.ticker}
            onChange={(e) => handleFilterChange('ticker', e.target.value)}
            placeholder="Filtrar por ticker..."
            aria-label="Filtrar por ticker"
            className={selectClass}
          />
          <select
            value={filters.sentiment}
            onChange={(e) => handleFilterChange('sentiment', e.target.value)}
            aria-label="Filtrar por sentimento"
            className={selectClass}
          >
            <option value="">Todos sentimentos</option>
            <option value="positive">Positivo</option>
            <option value="negative">Negativo</option>
            <option value="neutral">Neutro</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            aria-label="Filtrar por status"
            className={selectClass}
          >
            <option value="">Todos status</option>
            <option value="published">Publicado</option>
            <option value="archived">Arquivado</option>
          </select>
        </div>
      </div>

      {/* Conteúdo */}
      <div
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)]"
        aria-busy={isLoading}
      >
        {error && (
          <div className="flex items-center gap-3 p-6 text-sm text-[#F6465D]" role="alert">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span>Erro ao carregar notícias.</span>
            <button
              onClick={() => mutate()}
              className="ml-auto flex items-center gap-1.5 text-[#929AA5] hover:text-[#F0B90B] min-h-[44px] min-w-[44px]"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          </div>
        )}

        {isLoading && !data && (
          <div className="p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-[rgba(240,185,11,.04)] last:border-0 animate-pulse">
                <div className="w-1.5 h-8 rounded-full bg-[#2a2420] flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-3.5 bg-[#2a2420] rounded w-3/4 mb-1.5" />
                  <div className="h-3 bg-[#1e1a16] rounded w-1/3" />
                </div>
                <div className="h-5 w-16 bg-[#2a2420] rounded-full" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-[#929AA5]">Nenhuma notícia encontrada</p>
            {(filters.fonte || filters.ticker || filters.sentiment || filters.status) && (
              <button
                onClick={() => {
                  setFilters({ fonte: '', ticker: '', sentiment: '', status: '' })
                  setPage(1)
                }}
                className="mt-2 text-xs text-[#F0B90B] hover:underline min-h-[44px]"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Desktop: tabela */}
        {!error && items.length > 0 && (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full" aria-label="Lista de notícias">
                <thead>
                  <tr className="border-b border-[rgba(240,185,11,.08)]">
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Título</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Ticker</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Sentimento</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Fonte</th>
                    <th scope="col" className="text-left py-3 px-4 text-xs text-[#929AA5] font-medium">Status</th>
                    <th scope="col" className="text-right py-3 px-4 text-xs text-[#929AA5] font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((news) => (
                    <tr key={news.id} className="border-b border-[rgba(240,185,11,.04)] hover:bg-[rgba(240,185,11,.02)]">
                      <td className="py-3 px-4">
                        <p className="text-sm text-[#c5b99a] truncate max-w-xs" title={news.title}>
                          {news.title.length > 60 ? `${news.title.slice(0, 60)}…` : news.title}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[#F0B90B]">{news.ticker}</td>
                      <td className="py-3 px-4">
                        <Badge variant={SENTIMENT_COLORS[news.sentiment] as 'success' | 'error' | 'default'} size="xs">
                          {SENTIMENT_LABELS[news.sentiment]}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#929AA5]">{news.source}</td>
                      <td className="py-3 px-4">
                        <NewsStatusToggle
                          newsId={news.id}
                          currentStatus={news.status as 'published' | 'archived'}
                          onToggle={() => mutate()}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingNews(news)}
                            aria-label={`Editar notícia: ${news.title}`}
                            className="p-1.5 rounded hover:bg-[rgba(240,185,11,.08)] text-[#929AA5] hover:text-[#F0B90B] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          {news.url && news.url !== '#' && (
                            <a
                              href={news.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label="Ver notícia original"
                              className="p-1.5 rounded hover:bg-[rgba(240,185,11,.08)] text-[#929AA5] hover:text-[#F0B90B] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden flex flex-col gap-2 p-3">
              {items.map((news) => (
                <div key={news.id} className="rounded-lg border border-[rgba(240,185,11,.08)] p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm text-[#c5b99a] line-clamp-2 flex-1">{news.title}</p>
                    <Badge variant={SENTIMENT_COLORS[news.sentiment] as 'success' | 'error' | 'default'} size="xs">
                      {SENTIMENT_LABELS[news.sentiment]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#929AA5]">
                    <span className="font-mono text-[#F0B90B]">{news.ticker}</span>
                    <span>{news.source}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-[rgba(240,185,11,.04)]">
                    <NewsStatusToggle
                      newsId={news.id}
                      currentStatus={news.status as 'published' | 'archived'}
                      onToggle={() => mutate()}
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingNews(news)}
                        aria-label={`Editar notícia: ${news.title}`}
                        className="p-2 rounded hover:bg-[rgba(240,185,11,.08)] text-[#929AA5] hover:text-[#F0B90B] min-h-[44px] min-w-[44px] flex items-center justify-center"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Paginação */}
            <nav
              aria-label="Paginação de notícias"
              className="flex items-center justify-between px-4 py-3 border-t border-[rgba(240,185,11,.08)]"
            >
              <span className="text-xs text-[#929AA5]">
                <span className="hidden sm:inline">Página </span>
                {pagination.page} de {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  aria-label="Página anterior"
                  className="h-8 w-8 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-[rgba(240,185,11,.18)] text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page >= pagination.totalPages}
                  aria-label="Próxima página"
                  className="h-8 w-8 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-[rgba(240,185,11,.18)] text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </nav>
          </>
        )}
      </div>

      {/* Modal de edição */}
      {editingNews && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-news-title"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditingNews(null)} />
          <div ref={editModalRef} className="relative w-full sm:max-w-lg bg-[#1a1815] sm:rounded-xl border border-[rgba(240,185,11,.15)] p-6 max-h-[90vh] overflow-y-auto">
            <h2 id="edit-news-title" className="text-base font-semibold text-[#EAECEF] mb-4">
              Editar Notícia
            </h2>
            <NewsForm
              news={editingNews}
              onSave={() => {
                setEditingNews(null)
                mutate()
              }}
              onCancel={() => setEditingNews(null)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
