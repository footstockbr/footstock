'use client'
// ============================================================================
// Foot Stock — TransactionsTabs (module-15, TASK-4)
// Extrato paginado com abas: Todas / Agendadas / Limitadas / OCO
// Rastreabilidade: INT-036
// ============================================================================

import { useState } from 'react'
import { Tabs } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorState } from '@/components/ui/ErrorState'
import { Btn } from '@/components/ui/Btn'
import { Badge } from '@/components/ui/Badge'
import { useTransactions } from '@/hooks/useTransactions'
import { formatFS } from '@/lib/utils/formatCurrency'
import { formatDate } from '@/lib/utils/formatDate'
import type { TabItem } from '@/components/ui/Tabs'
import type { TransactionFilter } from '@/hooks/useTransactions'
import type { Transaction } from '@/types/models'

// ---------------------------------------------------------------------------
// Tipos e constantes
// ---------------------------------------------------------------------------

const FILTER_TABS: TabItem[] = [
  { value: 'ALL',       label: 'Todas' },
  { value: 'SCHEDULED', label: 'Agendadas' },
  { value: 'LIMIT',     label: 'Limitadas' },
  { value: 'OCO',       label: 'OCO' },
]

const EMPTY_MESSAGES: Record<TransactionFilter, string> = {
  ALL:       'Sem transações no extrato.',
  SCHEDULED: 'Sem transações agendadas.',
  LIMIT:     'Sem ordens limitadas.',
  OCO:       'Sem ordens OCO.',
}

// ---------------------------------------------------------------------------
// Row de transação
// ---------------------------------------------------------------------------

function TransactionRow({ tx }: { tx: Transaction }) {
  const isPositive = tx.amount > 0
  const amtColor = isPositive ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1e2a3a] last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-white truncate">{tx.description}</p>
        <p className="text-xs text-slate-400">
          {formatDate(tx.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        <Badge variant="default" className="text-xs">
          {tx.type}
        </Badge>
        <p className={`text-sm font-medium ${amtColor}`}>
          {isPositive ? '+' : ''}{formatFS(tx.amount)}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TransactionsTabs
// ---------------------------------------------------------------------------

export function TransactionsTabs() {
  const [filter, setFilter] = useState<TransactionFilter>('ALL')
  const [page, setPage] = useState(1)

  const { data, isLoading, isFetching, isError, refetch } = useTransactions({ filter, page })

  // Resetar para página 1 ao mudar aba
  function handleFilterChange(value: string) {
    setFilter(value as TransactionFilter)
    setPage(1)
  }

  const items = data?.items ?? []
  const meta = data?.meta

  return (
    <div>
      <Tabs
        tabs={FILTER_TABS}
        value={filter}
        onChange={handleFilterChange}
        className="mb-4"
      />

      {isError && (
        <ErrorState
          message="Erro ao carregar extrato."
          onRetry={() => void refetch()}
        />
      )}

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="min-h-[48px] w-full" />
          ))}
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          title={EMPTY_MESSAGES[filter]}
          className="py-10"
        />
      )}

      {!isLoading && !isError && items.length > 0 && (
        <>
          <div className={`divide-y divide-[#1e2a3a] transition-opacity ${isFetching ? 'opacity-50' : ''}`}>
            {items.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>

          {/* Paginação */}
          {meta && (
            <div className="flex items-center justify-between pt-4 gap-2">
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
                disabled={page === 1}
              >
                ← Anterior
              </Btn>
              <span role="status" aria-live="polite" className="text-xs text-slate-400">
                {page} / {meta.totalPages}
              </span>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                aria-label="Próxima página"
                disabled={!meta.hasNextPage}
              >
                Próxima →
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  )
}
