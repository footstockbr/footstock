'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Trophy,
  TrendingUp,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatFS, formatDateShort } from '@/lib/utils/format'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dividend {
  id: string
  ticker: string
  clubName: string
  type: 'ESPORTIVO' | 'FINANCEIRO'
  amount: number
  yieldPercent: number
  status: 'CREDITED' | 'PENDING' | 'EXPIRADO'
  triggerEvent: string | null
  createdAt: string
  daysRemaining?: number
}

interface DividendMeta {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

interface DividendResponse {
  items: Dividend[]
  meta: DividendMeta
}

// ── Constants ─────────────────────────────────────────────────────────────────

type TypeFilter = 'ALL' | 'ESPORTIVO' | 'FINANCEIRO'
type StatusFilter = 'ALL' | 'PENDING' | 'CREDITED' | 'EXPIRADO'

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ESPORTIVO', label: 'Esportivo' },
  { value: 'FINANCEIRO', label: 'Financeiro' },
]

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'CREDITED', label: 'Creditado' },
  { value: 'EXPIRADO', label: 'Expirado' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCards({ items }: { items: Dividend[] }) {
  const credited = items
    .filter(d => d.status === 'CREDITED')
    .reduce((acc, d) => acc + Number(d.amount), 0)

  const pending = items
    .filter(d => d.status === 'PENDING')
    .reduce((acc, d) => acc + Number(d.amount), 0)

  const pendingCount = items.filter(d => d.status === 'PENDING').length
  const expiredCount = items.filter(d => d.status === 'EXPIRADO').length

  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      <div className="bg-[#1E2329] rounded-xl p-4 border border-[rgba(46,189,133,.12)]">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-[#2EBD85]" />
          <span className="text-xs text-[#929AA5]">Total Creditado</span>
        </div>
        <p className="text-lg font-semibold text-[#2EBD85]">{formatFS(credited)}</p>
      </div>

      <div className="bg-[#1E2329] rounded-xl p-4 border border-[rgba(240,185,11,.12)]">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4 text-[#F0B90B]" />
          <span className="text-xs text-[#929AA5]">Aguardando ({pendingCount})</span>
        </div>
        <p className="text-lg font-semibold text-[#F0B90B]">{formatFS(pending)}</p>
      </div>

      <div className="bg-[#1E2329] rounded-xl p-4 border border-[rgba(146,154,165,.12)]">
        <div className="flex items-center gap-2 mb-1">
          <XCircle className="h-4 w-4 text-[#929AA5]" />
          <span className="text-xs text-[#929AA5]">Expirados</span>
        </div>
        <p className="text-lg font-semibold text-[#929AA5]">{expiredCount}</p>
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: Dividend['type'] }) {
  if (type === 'ESPORTIVO') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(240,185,11,.12)] text-[#F0B90B] border border-[rgba(240,185,11,.25)]">
        <Trophy className="h-2.5 w-2.5" />
        Esportivo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-[rgba(46,189,133,.12)] text-[#2EBD85] border border-[rgba(46,189,133,.25)]">
      <TrendingUp className="h-2.5 w-2.5" />
      Financeiro
    </span>
  )
}

function StatusBadge({ status, daysRemaining }: { status: Dividend['status']; daysRemaining?: number }) {
  if (status === 'CREDITED') {
    return <span className="text-xs font-medium text-[#2EBD85]">Creditado</span>
  }
  if (status === 'EXPIRADO') {
    return <span className="text-xs font-medium text-[#929AA5]">Expirado</span>
  }
  return (
    <span className="text-xs font-medium text-[#F0B90B]">
      Pendente{daysRemaining !== undefined ? ` · ${daysRemaining}d` : ''}
    </span>
  )
}

function DividendRow({
  dividend,
  onReinvest,
  isPending,
}: {
  dividend: Dividend
  onReinvest: (id: string) => void
  isPending: boolean
}) {
  return (
    <div
      className="flex items-center justify-between bg-[#1E2329] rounded-lg px-4 py-3 gap-3"
      data-testid={`dividend-row-${dividend.id}`}
    >
      {/* Left: type badge + club info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-[#EAECEF]">{dividend.ticker}</span>
          <TypeBadge type={dividend.type} />
          {dividend.triggerEvent && (
            <span className="text-[10px] text-[#929AA5]">
              {dividend.triggerEvent === 'VITORIA' ? '⚽ Vitória' : '🏆 Título'}
            </span>
          )}
        </div>
        <p className="text-xs text-[#929AA5] truncate">{dividend.clubName}</p>
        <p className="text-[10px] text-[#707A8A] mt-0.5">{formatDateShort(dividend.createdAt)}</p>
      </div>

      {/* Right: amount + yield + status + action */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-sm font-semibold text-[#EAECEF]">
          {formatFS(Number(dividend.amount))}
        </span>
        <span className="text-xs text-[#929AA5]">
          Yield: {dividend.yieldPercent.toFixed(2)}%
        </span>
        <StatusBadge status={dividend.status} daysRemaining={dividend.daysRemaining} />
        {dividend.status === 'PENDING' && (
          <button
            onClick={() => onReinvest(dividend.id)}
            disabled={isPending}
            className="mt-1 flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-[rgba(240,185,11,.15)] text-[#F0B90B] border border-[rgba(240,185,11,.3)] hover:bg-[rgba(240,185,11,.25)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid={`receber-btn-${dividend.id}`}
          >
            <RefreshCw className="h-3 w-3" />
            Receber
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DividendosClient() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [page, setPage] = useState(1)

  const params = new URLSearchParams({ page: String(page) })
  if (typeFilter !== 'ALL') params.set('type', typeFilter)
  if (statusFilter !== 'ALL') params.set('status', statusFilter)

  const { data, isLoading } = useQuery<DividendResponse>({
    queryKey: ['dividends', typeFilter, statusFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/dividends?${params}`)
      if (!res.ok) throw new Error('Erro ao carregar dividendos')
      const json = await res.json()
      return json.data
    },
    staleTime: 30_000,
  })

  // Busca sem filtro para os summary cards (sempre página 1, sem filtro de status)
  const { data: allData } = useQuery<DividendResponse>({
    queryKey: ['dividends-summary'],
    queryFn: async () => {
      const res = await fetch('/api/v1/dividends?page=1')
      if (!res.ok) return { items: [], meta: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }
      const json = await res.json()
      return json.data
    },
    staleTime: 60_000,
  })

  const reinvestMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/dividends/${id}/reinvest`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Erro ao receber dividendo')
      }
      return res.json()
    },
    onSuccess: () => {
      toast.success('Dividendo creditado ao seu saldo!')
      queryClient.invalidateQueries({ queryKey: ['dividends'] })
      queryClient.invalidateQueries({ queryKey: ['dividends-summary'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao receber dividendo.')
    },
  })

  const items = data?.items ?? []
  const meta = data?.meta
  const summaryItems = allData?.items ?? []

  return (
    <div className="min-h-screen bg-[#0B0E11] pb-8">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-[rgba(240,185,11,.15)] flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-[#F0B90B]" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[#EAECEF]">Dividendos</h1>
            <p className="text-xs text-[#929AA5]">Rendimentos das suas posições</p>
          </div>
        </div>

        {/* Summary cards */}
        <SummaryCards items={summaryItems} />

        {/* Type filters */}
        <div className="flex gap-2 mb-3">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setTypeFilter(f.value); setPage(1) }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                typeFilter === f.value
                  ? 'bg-[rgba(240,185,11,.15)] text-[#F0B90B] border border-[rgba(240,185,11,.4)]'
                  : 'bg-[#1E2329] text-[#929AA5] border border-transparent hover:text-[#EAECEF]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Status filters */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setStatusFilter(f.value); setPage(1) }}
              className={`px-3 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                statusFilter === f.value
                  ? 'text-[#EAECEF] bg-[#2B3139]'
                  : 'text-[#929AA5] hover:text-[#EAECEF]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-[#1E2329] animate-pulse rounded-lg" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && items.length === 0 && (
          <EmptyState
            title="Nenhum dividendo encontrado"
            description={
              typeFilter === 'ALL' && statusFilter === 'ALL'
                ? 'Você ainda não recebeu dividendos. Abra posições para começar a acumular rendimentos.'
                : 'Nenhum dividendo para os filtros selecionados.'
            }
          />
        )}

        {/* List */}
        {!isLoading && items.length > 0 && (
          <div className="space-y-2">
            {items.map(d => (
              <DividendRow
                key={d.id}
                dividend={d}
                onReinvest={id => reinvestMutation.mutate(id)}
                isPending={reinvestMutation.isPending}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={!meta.hasPreviousPage}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-[#929AA5]">
              {meta.page} / {meta.totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
              disabled={!meta.hasNextPage}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
