'use client'

import { useEffect, useState } from 'react'
import { TrendingDown } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

interface Transaction {
  id: string
  assetId: string
  type: string
  side: string
  quantity: number
  price: number
  fee: number
  totalAmount: number
  createdAt: string
}

interface PaginatedTransactions {
  data: Transaction[]
  pagination: { page: number; total: number; totalPages: number }
}

const SIDE_COLORS: Record<string, string> = {
  BUY:  'text-[#2EBD85]',
  SELL: 'text-[#F6465D]',
}

const SIDE_LABELS: Record<string, string> = {
  BUY:  'Compra',
  SELL: 'Venda',
}

const TYPE_LABELS: Record<string, string> = {
  MARKET:     'Mercado',
  LIMIT:      'Limitada',
  STOP_LOSS:  'Stop Loss',
  TAKE_PROFIT:'Take Profit',
}

function formatFS(value: number): string {
  return `FS$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function TransactionHistory() {
  const [data, setData] = useState<Transaction[]>([])
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
        description="Suas transacoes aparecerao aqui apos a primeira operacao"
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {data.map((tx) => (
        <div
          key={tx.id}
          className="bg-[#1E2329] rounded-lg border border-[rgba(240,185,11,.18)] p-4 flex items-center justify-between"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('text-xs font-bold', SIDE_COLORS[tx.side] ?? 'text-[#EAECEF]')}>
                {SIDE_LABELS[tx.side] ?? tx.side}
              </span>
              <span className="text-xs text-[#929AA5]">{TYPE_LABELS[tx.type] ?? tx.type}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#929AA5]">
              <span>{tx.quantity} cotas × {formatFS(tx.price)}</span>
              <span>taxa: {formatFS(tx.fee)}</span>
            </div>
            <div className="text-[10px] text-[#707A8A] mt-1">{formatDate(tx.createdAt)}</div>
          </div>
          <div className="text-right">
            <p className={cn('text-sm font-bold font-mono', SIDE_COLORS[tx.side] ?? 'text-[#EAECEF]')}>
              {tx.side === 'BUY' ? '-' : '+'}{formatFS(Math.abs(tx.totalAmount))}
            </p>
          </div>
        </div>
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
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}
