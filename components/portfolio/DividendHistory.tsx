'use client'
// ============================================================================
// Foot Stock — DividendHistory (module-16, TASK-2/ST002)
// Lista paginada de dividendos com filtros, estados e paginação mobile-first.
// Rastreabilidade: INT-072, INT-073, INT-074
// ============================================================================

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@/lib/constants'
import { queryKeys } from '@/lib/constants/query-keys'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { Btn } from '@/components/ui/Btn'
import { InfoIcon } from '@/components/ui/InfoIcon'
import { FIELD_TERM_MAP } from '@/lib/data/glossary'
import { useToast } from '@/hooks/useToast'
import { MESSAGES } from '@/lib/constants/messages'
import { useDividends, useDividendTotalCredited } from '@/hooks/useDividends'
import { formatFS } from '@/lib/utils/formatCurrency'
import { formatRelativeDate } from '@/lib/utils/formatDate'
import { cn } from '@/lib/utils/cn'
import type { DividendRecord, DividendTypeFilter, DividendStatusFilter } from '@/hooks/useDividends'
import { apiClient } from '@/lib/api/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DividendHistoryProps {
  className?: string
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonList() {
  return (
    <div aria-busy="true" role="status" aria-label="Carregando dividendos">
      {[0, 1, 2].map(i => (
        <Skeleton key={i} className="h-16 mb-3 w-full" />
      ))}
    </div>
  )
}

function TypeBadge({ type }: { type: 'ESPORTIVO' | 'FINANCEIRO' }) {
  if (type === 'ESPORTIVO') {
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border border-[#F0B90B]/30 bg-[#F0B90B]/10 text-[#F0B90B] whitespace-nowrap"
          aria-label="Tipo: Esportivo"
        >
          ⚽ Esportivo
        </span>
        <InfoIcon glossarySlug={FIELD_TERM_MAP['dividendo-esportivo']} />
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border border-[#F0B90B]/30 bg-[#F0B90B]/10 text-[#F0B90B] whitespace-nowrap"
      aria-label="Tipo: Financeiro"
    >
      📈 Financeiro
    </span>
  )
}

function StatusBadge({ status, daysRemaining }: { status: string; daysRemaining?: number }) {
  if (status === 'CREDITED') {
    return <Badge variant="success" className="text-xs">Creditado</Badge>
  }
  if (status === 'PENDING') {
    const text = daysRemaining === 0
      ? 'Expira hoje'
      : daysRemaining === 1
        ? 'Expira em 1 dia'
        : `Expira em ${daysRemaining ?? 0} dias`
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border whitespace-nowrap',
          daysRemaining === 0
            ? 'border-red-400/30 bg-red-900/20 text-red-400'
            : 'border-amber-400/30 bg-amber-900/30 text-amber-400'
        )}
      >
        ⏳ {text}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border border-slate-600/30 bg-slate-800 text-slate-400 whitespace-nowrap">
      Expirado
    </span>
  )
}

function DividendItem({ item, onReinvest, isReinvesting }: { item: DividendRecord; onReinvest: (id: string) => void; isReinvesting: boolean }) {
  return (
    <li
      role="listitem"
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-slate-800/60',
        'last:border-b-0'
      )}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={item.type} />
          <span className="text-sm font-semibold text-white">{item.ticker}</span>
          <span className="text-xs text-slate-400 truncate">{item.clubName}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={item.status} daysRemaining={item.daysRemaining} />
          <span className="text-xs text-slate-500">{formatRelativeDate(item.createdAt)}</span>
        </div>
      </div>

      <div className="flex flex-col sm:items-end gap-1">
        <span className="text-sm font-bold text-[#F0B90B]">+{formatFS(item.amount)}</span>
        <span className="text-xs text-slate-400 inline-flex items-center gap-1">{item.yieldPercent.toFixed(2)}% yield <InfoIcon glossarySlug={FIELD_TERM_MAP['dividend-yield']} /></span>
        {item.status === 'PENDING' && (
          <button
            onClick={() => onReinvest(item.id)}
            disabled={isReinvesting}
            className={cn(
              'min-h-[44px] px-3 py-1 text-xs font-medium rounded-lg',
              'bg-amber-500/20 text-amber-400 border border-amber-500/30',
              'hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-colors'
            )}
            aria-label={`Reinvestir dividendo de ${item.ticker}`}
          >
            {isReinvesting ? '...' : 'Reinvestir'}
          </button>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DividendHistory({ className }: DividendHistoryProps) {
  const [typeFilter, setTypeFilter] = useState<DividendTypeFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<DividendStatusFilter>('ALL')
  const [page, setPage] = useState(1)
  const [reinvestingId, setReinvestingId] = useState<string | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [, startTransition] = useTransition()

  const { data, isLoading, isError, refetch } = useDividends({
    type: typeFilter,
    status: statusFilter,
    page,
  })

  const totalCredited = useDividendTotalCredited(data?.items)
  const totalPages = data?.meta.totalPages ?? 1

  const reinvestMutation = useMutation({
    mutationFn: async (dividendId: string) => {
      await apiClient.post(`/api/v1/dividends/${dividendId}/reinvest`, {})
    },
    onMutate: (dividendId: string) => {
      setReinvestingId(dividendId)
    },
    onSuccess: () => {
      toast.success(MESSAGES.PORTFOLIO.DIVIDEND_REINVESTED)
      void queryClient.invalidateQueries({ queryKey: queryKeys.dividends.all })
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: { code?: string; message?: string } } } }
      const code = err?.response?.data?.error?.code
      if (code === 'DIV_001') {
        toast.error(MESSAGES.PORTFOLIO.DIVIDEND_ALREADY_PROCESSED)
      } else if (code === 'DIV_002') {
        toast.error(MESSAGES.PORTFOLIO.DIVIDEND_EXPIRED)
      } else {
        toast.error(MESSAGES.PORTFOLIO.DIVIDEND_REINVEST_ERROR)
      }
    },
    onSettled: () => {
      setReinvestingId(null)
    },
  })

  // Filter tabs — tipo
  const typeFilters: Array<{ value: DividendTypeFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'ESPORTIVO', label: 'Esportivos' },
    { value: 'FINANCEIRO', label: 'Financeiros' },
  ]

  // Filter tabs — status
  const statusFilters: Array<{ value: DividendStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'PENDING', label: 'Pendentes' },
    { value: 'CREDITED', label: 'Creditados' },
    { value: 'EXPIRADO', label: 'Expirados' },
  ]

  // Mensagem contextual para empty state com filtros ativos
  function getFilteredEmptyMessage(): string {
    const statusLabels: Record<DividendStatusFilter, string> = {
      ALL: '',
      PENDING: 'pendente',
      CREDITED: 'creditado',
      EXPIRADO: 'expirado',
    }
    const typeLabels: Record<DividendTypeFilter, string> = {
      ALL: '',
      ESPORTIVO: 'esportivo',
      FINANCEIRO: 'financeiro',
    }
    const parts: string[] = []
    if (typeFilter !== 'ALL') parts.push(typeLabels[typeFilter])
    if (statusFilter !== 'ALL') parts.push(statusLabels[statusFilter])
    if (parts.length === 0) return 'Nenhum dividendo encontrado.'
    return `Nenhum dividendo ${parts.join(' ')} encontrado.`
  }

  if (isLoading) return <SkeletonList />

  if (isError) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-slate-400 mb-3">Erro ao carregar dividendos. Tente novamente.</p>
        <Btn variant="secondary" size="sm" onClick={() => void refetch()}>
          Tentar novamente
        </Btn>
      </div>
    )
  }

  const items = data?.items ?? []
  const hasActiveFilter = typeFilter !== 'ALL' || statusFilter !== 'ALL'

  if (items.length === 0 && !hasActiveFilter) {
    return (
      <EmptyState
        title="Sem dividendos ainda"
        description="Continue negociando para acumular dividendos esportivos e financeiros!"
        aria-label="Sem dividendos"
      >
        <Link
          href={ROUTES.MERCADO}
          className="text-xs font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          Ir para Mercado
        </Link>
      </EmptyState>
    )
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Sumário */}
      {totalCredited > 0 && (
        <p className="text-sm text-slate-400">
          Total recebido: <span className="font-bold text-[#F0B90B]">{formatFS(totalCredited)}</span>
        </p>
      )}

      {/* Filtros por tipo */}
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por tipo">
        {typeFilters.map(f => (
          <button
            key={f.value}
            aria-pressed={typeFilter === f.value ? 'true' : 'false'}
            onClick={() => startTransition(() => { setTypeFilter(f.value); setPage(1) })}
            className={cn(
              'min-h-[44px] px-3 py-1 text-xs font-medium rounded-full border transition-colors',
              typeFilter === f.value
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Filtros por status */}
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Filtrar por status">
        {statusFilters.map(f => (
          <button
            key={f.value}
            aria-pressed={statusFilter === f.value ? 'true' : 'false'}
            onClick={() => startTransition(() => { setStatusFilter(f.value); setPage(1) })}
            className={cn(
              'min-h-[44px] px-3 py-1 text-xs font-medium rounded-full border transition-colors',
              statusFilter === f.value
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum resultado"
          description={getFilteredEmptyMessage()}
          aria-label="Nenhum dividendo com os filtros selecionados"
        />
      ) : (
        <ul role="list" className="divide-y divide-slate-800/60">
          {items.map(item => (
            <DividendItem
              key={item.id}
              item={item}
              onReinvest={(id) => reinvestMutation.mutate(id)}
              isReinvesting={reinvestingId === item.id}
            />
          ))}
        </ul>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Ir para página anterior"
            className={cn(
              'min-h-[44px] px-4 text-sm rounded-lg border transition-colors',
              'border-slate-700 text-slate-400 hover:border-slate-600',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'w-full sm:w-auto'
            )}
          >
            Anterior
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Ir para próxima página"
            className={cn(
              'min-h-[44px] px-4 text-sm rounded-lg border transition-colors',
              'border-slate-700 text-slate-400 hover:border-slate-600',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'w-full sm:w-auto'
            )}
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  )
}
