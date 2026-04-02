// ============================================================================
// Foot Stock — hooks/useDividends.ts (module-16)
// React Query hook para histórico paginado de dividendos com filtros.
// Rastreabilidade: INT-072, INT-073
// ============================================================================

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type DividendTypeFilter = 'ALL' | 'ESPORTIVO' | 'FINANCEIRO'
export type DividendStatusFilter = 'ALL' | 'CREDITED' | 'PENDING' | 'EXPIRADO'

export interface DividendRecord {
  id: string
  userId: string
  ticker: string
  clubName: string
  type: 'ESPORTIVO' | 'FINANCEIRO'
  amount: number
  yieldPercent: number
  status: 'CREDITED' | 'PENDING' | 'EXPIRADO'
  processedMonth?: string | null
  scheduledFor?: string | null
  triggerEvent?: string | null
  createdAt: string
  daysRemaining?: number // apenas para status PENDING (calculado pelo backend)
}

export interface DividendMeta {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface DividendResult {
  items: DividendRecord[]
  meta: DividendMeta
}

interface UseDividendsOptions {
  type?: DividendTypeFilter
  status?: DividendStatusFilter
  page?: number
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDividends({ type = 'ALL', status = 'ALL', page = 1 }: UseDividendsOptions = {}) {
  return useQuery<DividendResult>({
    queryKey: ['dividends', type, status, page],
    staleTime: 60 * 1000,
    queryFn: async () => {
      const params: Record<string, string> = { page: String(page) }
      if (type !== 'ALL') params.type = type
      if (status !== 'ALL') params.status = status

      const res = await apiClient.get<{
        success: boolean
        data: DividendResult
      }>('/api/v1/dividends', { params })

      return res.data.data
    },
  })
}

/** Calcula total creditado (apenas status CREDITED) */
export function useDividendTotalCredited(items: DividendRecord[] | undefined): number {
  if (!items) return 0
  return items
    .filter(d => d.status === 'CREDITED')
    .reduce((sum, d) => sum + d.amount, 0)
}
