// ============================================================================
// Foot Stock — hooks/useTransactions.ts (module-15, TASK-4)
// React Query para transações paginadas com filtro por tipo.
// Rastreabilidade: INT-036
// ============================================================================

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api/client'
import { ROUTES } from '@/lib/constants/routes'
import { queryKeys } from '@/lib/constants/query-keys'
import type { Transaction } from '@/types/models'
import type { PaginatedResult } from '@/types/api'

export type TransactionFilter = 'ALL' | 'SCHEDULED' | 'LIMIT' | 'OCO'

interface UseTransactionsOptions {
  filter: TransactionFilter
  page: number
  pageSize?: number
}

function filterToQueryParam(filter: TransactionFilter): Record<string, string> {
  if (filter === 'ALL') return {}
  const map: Record<TransactionFilter, string> = {
    ALL: '',
    SCHEDULED: 'SCHEDULED',
    LIMIT: 'LIMIT',
    OCO: 'OCO',
  }
  return { financialType: map[filter] }
}

export function useTransactions({ filter, page, pageSize = 20 }: UseTransactionsOptions) {
  const router = useRouter()

  const query = useQuery<PaginatedResult<Transaction>>({
    queryKey: queryKeys.transactions.list(filter, page),
    queryFn: async () => {
      const params = {
        page: String(page),
        limit: String(pageSize),
        ...filterToQueryParam(filter),
      }
      const res = await apiClient.get<{
        success: boolean
        data: Transaction[]
        meta: { total: number; page: number; limit: number; totalPages: number; hasNextPage: boolean }
      }>('/api/v1/transactions', { params })
      return {
        items: res.data.data,
        meta: {
          page: res.data.meta?.page ?? page,
          pageSize,
          totalItems: res.data.meta?.total ?? 0,
          totalPages: res.data.meta?.totalPages ?? 1,
          hasNextPage: res.data.meta?.hasNextPage ?? false,
          hasPreviousPage: page > 1,
        },
      }
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    gcTime: 300_000,
    retry: 2,
  })

  useEffect(() => {
    if (query.error) {
      const status = (query.error as { response?: { status?: number } }).response?.status
      if (status === 401) router.push(ROUTES.LOGIN)
    }
  }, [query.error, router])

  return query
}
