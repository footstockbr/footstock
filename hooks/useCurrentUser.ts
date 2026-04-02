'use client'

// ============================================================================
// Foot Stock — useCurrentUser
// Hook que retorna os dados do usuário autenticado via React Query.
// Busca em /api/v1/me — cria stale cache de 5min.
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { authedFetch } from '@/lib/api/authed-fetch'
import type { User } from '@/types/models'
import { queryKeys } from '@/lib/constants/query-keys'

export function useCurrentUser() {
  return useQuery<User | null, Error>({
    queryKey: queryKeys.currentUser.all,
    queryFn: async () => {
      const res = await authedFetch('/api/v1/me')
      if (res.status === 401) return null
      if (!res.ok) throw new Error('Erro ao carregar usuário')
      const body = await res.json()
      return (body as { data: User }).data
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })
}
