'use client'

// ============================================================================
// Foot Stock — useCurrentUser
// Hook que retorna os dados do usuário autenticado via React Query.
// Busca em /api/v1/me — cria stale cache de 5min.
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import type { User } from '@/types/models'

export function useCurrentUser() {
  return useQuery<User | null, Error>({
    queryKey: ['current-user'],
    queryFn: async () => {
      const res = await fetch('/api/v1/me')
      if (res.status === 401) return null
      if (!res.ok) throw new Error('Erro ao carregar usuário')
      const body = await res.json()
      return (body as { data: User }).data
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })
}
