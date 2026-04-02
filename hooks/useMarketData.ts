'use client'

// ============================================================================
// Foot Stock — useMarketData / useInfiniteMarketData
// React Query infinita para listagem de ativos com filtros.
// ============================================================================

import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query'
import type { AssetFilters, AssetApiResponse, AssetListItem } from '@/types/market'
import { queryKeys } from '@/lib/constants/query-keys'

/**
 * Hook de listagem infinita de ativos.
 * staleTime=2s para dados near-real-time.
 */
export function useInfiniteMarketData(filters: AssetFilters) {
  return useInfiniteQuery<AssetApiResponse, Error>({
    queryKey: queryKeys.assets.list(filters),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams()
      if (filters.division) params.set('division', filters.division)
      if (filters.sentiment) params.set('sentiment', filters.sentiment)
      if (filters.sort) params.set('sort', filters.sort)
      if (filters.search) params.set('search', filters.search)
      params.set('page', String(pageParam ?? 1))
      params.set('limit', '20')

      const res = await fetch(`/api/v1/assets?${params}`)
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}))
        throw new Error((errorBody as { error?: { code?: string } })?.error?.code ?? 'FETCH_ERROR')
      }
      return res.json() as Promise<AssetApiResponse>
    },
    initialPageParam: 1,
    getNextPageParam: lastPage =>
      lastPage.data.length === lastPage.limit ? lastPage.page + 1 : undefined,
    staleTime: 2_000,
    gcTime: 30_000,
  })
}

/**
 * Flattens todas as páginas em um único array de ativos.
 */
export function flattenAssets(
  data: InfiniteData<AssetApiResponse> | undefined
): AssetListItem[] {
  if (!data) return []
  return data.pages.flatMap(page => page.data)
}

/**
 * Prefetch para SSR (HydrationBoundary).
 */
export async function prefetchMarketData(queryClient: QueryClient) {
  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.assets.list(),
    queryFn: async ({ pageParam }) => {
      const res = await fetch(
        `/api/v1/assets?limit=20&page=${pageParam ?? 1}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return { data: [], total: 0, page: 1, limit: 20, _delaySeconds: 0, _cacheHint: '' }
      return res.json() as Promise<AssetApiResponse>
    },
    initialPageParam: 1,
  })
}
