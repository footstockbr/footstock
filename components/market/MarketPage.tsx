'use client'

// ============================================================================
// Foot Stock — MarketPage (Client Component)
// Orquestra filtros, busca, lista de ativos e delay badge.
// ============================================================================

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import MarketFilters from './MarketFilters'
import MarketSearch from './MarketSearch'
import MarketList from './MarketList'
import DelayBadge from './DelayBadge'
import { useInfiniteMarketData, flattenAssets } from '@/hooks/useMarketData'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import type { AssetFilters } from '@/types/market'

// TickerNewsTape é lazy — SSE client-only
const TickerNewsTape = dynamic(() => import('./TickerNewsTape'), { ssr: false })

export default function MarketPage() {
  const router = useRouter()
  const [filters, setFilters] = useState<AssetFilters>({})
  const [searchValue, setSearchValue] = useState('')

  const { data: user, isLoading: isUserLoading } = useCurrentUser()

  const activeFilters: AssetFilters = {
    ...filters,
    ...(searchValue ? { search: searchValue } : {}),
  }

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteMarketData(activeFilters)

  // Redirecionar se usuário não autenticado
  useEffect(() => {
    if (!isUserLoading && user === null) {
      router.push('/login')
    }
  }, [user, isUserLoading, router])

  const assets = flattenAssets(data)
  const delaySeconds = data?.pages[0]?._delaySeconds ?? 0

  function clearFilters() {
    setFilters({})
    setSearchValue('')
  }

  return (
    <div
      data-testid="market-page"
      className="flex flex-col gap-3 px-4 pt-4 pb-24"
    >
      {/* Faixa de notícias real-time (Should) */}
      <TickerNewsTape />

      {/* Busca */}
      <MarketSearch
        value={searchValue}
        onChange={setSearchValue}
        onClear={() => setSearchValue('')}
      />

      {/* Filtros de divisão */}
      <MarketFilters filters={filters} onChange={setFilters} />

      {/* Badge de delay para planos com atraso */}
      {user && delaySeconds > 0 && (
        <DelayBadge planType={user.planType} delaySeconds={delaySeconds} />
      )}

      {/* Erro ao carregar */}
      {isError && (
        <div
          role="alert"
          data-testid="market-error"
          className="flex flex-col items-center gap-3 py-8 px-4 rounded-lg bg-red-900/20 border border-red-600/50 text-center"
        >
          <p className="text-sm text-red-400">
            Não foi possível carregar os ativos. Verifique sua conexão e tente novamente.
          </p>
          <button
            type="button"
            data-testid="market-error-retry"
            onClick={() => refetch()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 hover:bg-red-500 text-white transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Lista de ativos */}
      <MarketList
        assets={assets}
        favoriteClub={user?.favoriteClub ?? null}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        hasMore={hasNextPage ?? false}
        onClearFilters={clearFilters}
      />
    </div>
  )
}
