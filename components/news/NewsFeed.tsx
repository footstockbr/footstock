'use client'

// ============================================================================
// Foot Stock — NewsFeed
// Lista infinita de noticias com IntersectionObserver e React Query.
// Rastreabilidade: module-17-rss-noticias / TASK-5
// ============================================================================

import { useRef, useEffect, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import { apiClient } from '@/lib/api/client'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import NewsCard from './NewsCard'
import type { NewsRecord } from '@/lib/types/news'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NewsFeedPage {
  success: boolean
  items: NewsRecord[]
  total: number
  page: number
  hasNextPage: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface NewsFeedProps {
  selectedTicker?: string
}

export default function NewsFeed({ selectedTicker }: NewsFeedProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<NewsFeedPage>({
    queryKey: queryKeys.news.list(selectedTicker),
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string | number> = { page: pageParam as number }
      if (selectedTicker) params.ticker = selectedTicker
      const res = await apiClient.get<NewsFeedPage>('/api/v1/news', { params })
      return res.data
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasNextPage ? lastPage.page + 1 : undefined,
    staleTime: 120_000,
  })

  // IntersectionObserver for infinite scroll
  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(handleIntersect, { threshold: 0.1 })
    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [handleIntersect])

  // Flatten pages
  const items = data?.pages.flatMap((p) => p.items) ?? []

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4" aria-busy="true">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[80px] rounded-xl bg-[#1E2329] animate-pulse"
            aria-hidden="true"
          />
        ))}
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 py-8 px-4 rounded-lg bg-red-900/20 border border-red-600/50 text-center mx-4"
      >
        <p className="text-sm text-red-400">
          Nao foi possivel carregar as noticias. Tente novamente.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  if (items.length === 0) {
    return (
      <EmptyState
        title="Nenhuma noticia encontrada"
        description={
          selectedTicker
            ? `Nao ha noticias recentes para ${selectedTicker}.`
            : 'Nao ha noticias disponiveis no momento.'
        }
        className="py-16"
      />
    )
  }

  // ---------------------------------------------------------------------------
  // Feed
  // ---------------------------------------------------------------------------
  return (
    <div role="feed" aria-busy={isLoading} className="flex flex-col gap-3 p-4">
      {items.map((news) => (
        <NewsCard key={news.id} news={news} />
      ))}

      {/* Sentinel for infinite scroll */}
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />

      {/* Fetching next page */}
      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <LoadingSpinner size="sm" />
        </div>
      )}

      {/* End of feed */}
      {!hasNextPage && items.length > 0 && (
        <p className="text-xs text-slate-500 text-center py-4">
          Voce chegou ao final
        </p>
      )}
    </div>
  )
}
