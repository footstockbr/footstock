'use client'

import { useEffect, useState } from 'react'
import { TrendingDown } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { ExtratoItem, type ExtratoTransaction } from '@/components/extrato/ExtratoItem'

interface PaginatedTransactions {
  data: ExtratoTransaction[]
  pagination: { page: number; total: number; totalPages: number }
}

export function TransactionHistory() {
  const [data, setData] = useState<ExtratoTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/v1/transactions?page=${page}&limit=10`)
      .then(r => r.json())
      .then((json: PaginatedTransactions & { success?: boolean }) => {
        if (json.success !== false && json.data) {
          setData(json.data)
          setTotalPages(json.pagination?.totalPages ?? 1)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [page])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 animate-pulse">
            <div className="h-4 bg-[#2B3139] rounded w-40 mb-2" />
            <div className="h-3 bg-[#2B3139] rounded w-28" />
          </div>
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<TrendingDown />}
        title="Extrato vazio"
        description="Suas transações aparecerão aqui após a primeira operação"
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {data.map((tx) => (
        <ExtratoItem key={tx.id} transaction={tx} />
      ))}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-xs rounded bg-[#2B3139] text-[#929AA5] disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-xs text-[#929AA5] self-center">{page}/{totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-xs rounded bg-[#2B3139] text-[#929AA5] disabled:opacity-40"
          >
            Proxima
          </button>
        </div>
      )}
    </div>
  )
}
