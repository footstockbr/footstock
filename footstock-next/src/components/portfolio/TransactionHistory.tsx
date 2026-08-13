'use client'

import { useEffect, useState, useCallback } from 'react'
import { TrendingDown, AlertCircle, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ExtratoItem, type ExtratoTransaction } from '@/components/extrato/ExtratoItem'

interface PaginatedTransactions {
  data: ExtratoTransaction[]
  pagination: {
    page: number
    total: number
    totalPages: number
    hasNext: boolean
  }
}

type LoadState = 'loading' | 'error' | 'empty' | 'success'

export function TransactionHistory() {
  const [data, setData] = useState<ExtratoTransaction[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [hasNext, setHasNext] = useState(false)

  const load = useCallback(async (targetPage: number) => {
    setState('loading')
    setError(null)

    try {
      const res = await fetch(`/api/v1/transactions?page=${targetPage}&limit=10`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? `Erro ${res.status} ao carregar extrato.`)
      }

      const json: PaginatedTransactions = await res.json()
      setData(json.data ?? [])
      setTotalPages(json.pagination?.totalPages ?? 1)
      setHasNext(json.pagination?.hasNext ?? false)
      setState((json.data?.length ?? 0) === 0 ? 'empty' : 'success')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Erro ao carregar extrato.')
    }
  }, [])

  useEffect(() => {
    load(page)
  }, [page, load])

  function handleRetry() {
    load(page)
  }

  if (state === 'loading') {
    return (
      <div data-testid="transaction-history-loading" aria-busy="true" aria-label="Carregando extrato" className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 animate-pulse">
            <div className="h-4 bg-[#2B3139] rounded w-40 mb-2" />
            <div className="h-3 bg-[#2B3139] rounded w-28" />
          </div>
        ))}
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div
        data-testid="transaction-history-error"
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-950"
      >
        <AlertCircle className="mx-auto h-5 w-5 text-red-600 dark:text-red-300" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium text-red-800 dark:text-red-100">
          {error ?? 'Erro ao carregar extrato.'}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          data-testid="transaction-history-retry"
          className="mt-3 inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Tentar novamente
        </button>
      </div>
    )
  }

  if (state === 'empty') {
    return (
      <div data-testid="transaction-history-empty">
        <EmptyState
          icon={<TrendingDown />}
          title="Extrato vazio"
          description="Suas transações aparecerão aqui após a primeira operação"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2" data-testid="transaction-history-success">
      {data.map((tx) => (
        <ExtratoItem key={tx.id} transaction={tx} />
      ))}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-2">
          <button
            data-testid="transaction-history-prev"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="min-h-[44px] min-w-[44px] px-3 py-1 text-xs rounded bg-[#2B3139] text-[#929AA5] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]"
          >
            Anterior
          </button>
          <span className="text-xs text-[#929AA5] self-center">{page}/{totalPages}</span>
          <button
            data-testid="transaction-history-next"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={!hasNext}
            className="min-h-[44px] min-w-[44px] px-3 py-1 text-xs rounded bg-[#2B3139] text-[#929AA5] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]"
          >
            Proxima
          </button>
        </div>
      )}
    </div>
  )
}
