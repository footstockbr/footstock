'use client'

// ============================================================================
// Foot Stock — MarketList
// Lista virtualizada dos ativos com clube favorito fixado no topo.
// Infinite scroll via IntersectionObserver.
// ============================================================================

import { useMemo, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Star } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils/cn'
import AssetCardSkeleton from './AssetCardSkeleton'
import type { AssetListItem } from '@/types/market'

// Lazy loading do AssetCard — SSE é client-only
const AssetCard = dynamic(() => import('./AssetCard'), {
  loading: () => <AssetCardSkeleton />,
  ssr: false,
})

interface MarketListProps {
  assets: AssetListItem[]
  favoriteClub?: string | null
  isLoading: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  hasMore: boolean
  onClearFilters: () => void
}

export default function MarketList({
  assets,
  favoriteClub,
  isLoading,
  isFetchingNextPage,
  onLoadMore,
  hasMore,
  onClearFilters,
}: MarketListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Pin do clube favorito no topo
  const sortedAssets = useMemo(() => {
    if (!favoriteClub) return assets
    const idx = assets.findIndex(a => a.ticker === favoriteClub)
    if (idx === -1) return assets
    const fav = assets[idx]
    const rest = assets.filter(a => a.ticker !== favoriteClub)
    return [fav, ...rest]
  }, [assets, favoriteClub])

  const virtualizer = useVirtualizer({
    count: sortedAssets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96, // 88px card + 8px gap
    overscan: 5,
  })

  // IntersectionObserver para infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting && hasMore && !isFetchingNextPage) {
          onLoadMore()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isFetchingNextPage, onLoadMore])

  // Estado de carregamento inicial
  if (isLoading && assets.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <AssetCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  // Estado vazio
  if (!isLoading && assets.length === 0) {
    return (
      <div
        data-testid="market-empty-state"
        className="flex flex-col items-center gap-3 py-12 text-center"
      >
        <p className="text-text-secondary text-sm">
          Nenhum ativo encontrado com estes filtros
        </p>
        <p className="text-text-tertiary text-xs">Ajuste os filtros ou tente outra busca.</p>
        <button
          type="button"
          data-testid="empty-state-clear-filters"
          onClick={onClearFilters}
          className="text-violet-400 text-sm underline hover:text-violet-300 transition-colors"
        >
          Limpar filtros
        </button>
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      data-testid="market-list"
      className="overflow-auto"
      style={{ height: 'calc(100vh - 220px)' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => {
          const asset = sortedAssets[virtualItem.index]
          if (!asset) return null
          const isFavorite = asset.ticker === favoriteClub

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: virtualItem.start,
                width: '100%',
              }}
            >
              {isFavorite && (
                <span
                  data-testid="favorite-club-label"
                  className="flex items-center gap-1 text-xs text-violet-400 font-medium mb-1"
                >
                  <Star size={12} fill="currentColor" aria-hidden="true" />
                  Seu Clube
                </span>
              )}
              <AssetCard
                asset={asset}
                isFavorite={isFavorite}
                className="mb-2"
              />
              {virtualItem.index === sortedAssets.length - 1 && (
                <div ref={sentinelRef} aria-hidden="true" />
              )}
            </div>
          )
        })}
      </div>

      {isFetchingNextPage && (
        <div className="flex justify-center py-3" aria-label="Carregando mais ativos">
          <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
