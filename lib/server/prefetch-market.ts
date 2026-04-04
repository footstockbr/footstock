// ============================================================================
// Foot Stock — prefetchMarketData (server-safe)
// Separado de hooks/useMarketData.ts ('use client') para que possa ser
// importado em Server Components sem erro de boundary.
// ============================================================================

import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/constants/query-keys'
import type { AssetApiResponse } from '@/types/market'

export async function prefetchMarketData(queryClient: QueryClient) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  await queryClient.prefetchInfiniteQuery({
    queryKey: queryKeys.assets.list(),
    queryFn: async ({ pageParam }) => {
      const res = await fetch(
        `${baseUrl}/api/v1/assets?limit=20&page=${pageParam ?? 1}`,
        { cache: 'no-store' }
      )
      // Throw so React Query does NOT dehydrate empty data to the client.
      // The client will fetch on mount with proper auth token instead.
      if (!res.ok) throw new Error(`prefetch_failed:${res.status}`)
      return res.json() as Promise<AssetApiResponse>
    },
    initialPageParam: 1,
  })
}
