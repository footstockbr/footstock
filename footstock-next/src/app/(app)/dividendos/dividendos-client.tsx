'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  TrendingUp,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatFS, formatDateShort } from '@/lib/utils/format'
import { GlossaryInfoIcon } from '@/components/ui/glossary-info-icon'
import { DividendTypeLabel } from '@/components/dividends/DividendTypeLabel'
import type { DividendTypeValue } from '@/components/dividends/DividendTypeLabel'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { Spinner } from '@/components/ui/spinner'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dividend {
  id: string
  ticker: string
  clubName: string
  type: DividendTypeValue
  amount: number
  yieldPercent: number
  status: 'CREDITED' | 'PENDING' | 'EXPIRADO' | 'BLOCKED_PLAN'
  triggerEvent: string | null
  createdAt: string
  daysRemaining?: number
  sharesSnapshot?: number | null
  pricePerShare?: number | null
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

type TypeFilter = 'ALL' | 'SPORTING_RESULT' | 'FINANCIAL_PERIODIC' | 'YIELD_DIFFERENTIAL' | 'ESPORTIVO' | 'FINANCEIRO'
type StatusFilter = 'ALL' | 'PENDING' | 'CREDITED' | 'EXPIRADO' | 'BLOCKED_PLAN'

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'SPORTING_RESULT', label: 'Resultado Esportivo' },
  { value: 'FINANCIAL_PERIODIC', label: 'Financeiro Periódico' },
  { value: 'YIELD_DIFFERENTIAL', label: 'Yield Diferencial' },
]

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'CREDITED', label: 'Creditado' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'BLOCKED_PLAN', label: 'Pendente venda' },
  { value: 'EXPIRADO', label: 'Expirado' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCards({ items }: { items: Dividend[] }) {
  const credited = items
    .filter(d => d.status === 'CREDITED')
    .reduce((acc, d) => acc + Number(d.amount), 0)

  const pendingRealization = items
    .filter(d => d.status === 'BLOCKED_PLAN')
    .reduce((acc, d) => acc + Number(d.amount), 0)

  const pendingCount = items.filter(d => d.status === 'BLOCKED_PLAN').length
  const expiredCount = items.filter(d => d.status === 'EXPIRADO').length

  return (
    <div className="grid grid-cols-3 gap-3 mb-5" data-testid="dividendos-summary">
      <div className="bg-[#1E2329] rounded-xl p-4 border border-[rgba(46,189,133,.12)]">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-[#2EBD85]" />
          <span className="text-xs text-[#929AA5]">Total Creditado</span>
        </div>
        <p className="text-lg font-semibold text-[#2EBD85]">{formatFS(credited)}</p>
      </div>

      <div className="bg-[#1E2329] rounded-xl p-4 border border-[rgba(102,126,234,.12)]">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4" style={{ color: '#667EEA' }} />
          <span className="text-xs text-[#929AA5]">Pend. venda ({pendingCount})</span>
        </div>
        <p className="text-lg font-semibold" style={{ color: '#667EEA' }}>{formatFS(pendingRealization)}</p>
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

function StatusBadge({ status, daysRemaining }: { status: Dividend['status']; daysRemaining?: number }) {
  if (status === 'CREDITED') {
    return <span className="text-xs font-medium text-[#2EBD85]">Creditado</span>
  }
  if (status === 'EXPIRADO') {
    return <span className="text-xs font-medium text-[#929AA5]">Expirado</span>
  }
  if (status === 'BLOCKED_PLAN') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: '#667EEA' }}>
        <Lock className="h-3 w-3" />
        Pendente — venda para realizar
      </span>
    )
  }
  return (
    <span className="text-xs font-medium text-[#F0B90B]">
      Pendente{daysRemaining !== undefined ? ` · ${daysRemaining}d` : ''}
    </span>
  )
}

function TriggerEventLabel({ event }: { event: string | null }) {
  if (!event) return null
  const labels: Record<string, string> = {
    VITORIA: 'Vitória',
    TITULO: 'Título',
    CAMPEONATO: 'Campeonato',
    PLAN_UPGRADE: 'Upgrade de plano',
    SELL_REALIZATION: 'Realizado na venda',
  }
  return (
    <span className="text-[10px] text-[#929AA5]">
      {labels[event] ?? event}
    </span>
  )
}

function DividendRow({ dividend }: { dividend: Dividend }) {
  return (
    <div
      className="flex items-center justify-between bg-[#1E2329] rounded-lg px-4 py-3 gap-3"
      data-testid={`dividend-row-${dividend.id}`}
    >
      {/* Left: type badge + club info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-[#EAECEF]">{dividend.ticker}</span>
          <DividendTypeLabel type={dividend.type} />
          <TriggerEventLabel event={dividend.triggerEvent} />
        </div>
        <p className="text-xs text-[#929AA5] truncate">{dividend.clubName}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <p className="text-[10px] text-[#707A8A]">{formatDateShort(dividend.createdAt)}</p>
          {dividend.sharesSnapshot != null && (
            <p className="text-[10px] text-[#707A8A]">
              {Number(dividend.sharesSnapshot).toFixed(0)} ações na data
            </p>
          )}
        </div>
      </div>

      {/* Right: amount + yield + status */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className="text-sm font-semibold"
          style={{ color: dividend.status === 'BLOCKED_PLAN' ? '#929AA5' : '#EAECEF' }}
        >
          {formatFS(Number(dividend.amount))}
        </span>
        {dividend.yieldPercent > 0 && (
          <span className="text-xs text-[#929AA5]">
            {dividend.yieldPercent.toFixed(2)}% <GlossaryInfoIcon fieldKey="dividend-yield" size={11} />
          </span>
        )}
        {dividend.pricePerShare != null && (
          <span className="text-[10px] text-[#707A8A]">
            {formatFS(Number(dividend.pricePerShare))} / ação
          </span>
        )}
        <StatusBadge status={dividend.status} daysRemaining={dividend.daysRemaining} />
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DividendosClient() {
  const { hasAccess, isLoading: isPlanLoading } = usePlanGuard()
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [page, setPage] = useState(1)

  // Hooks devem ser chamados incondicionalmente (rules-of-hooks). As queries
  // ficam desativadas via `enabled` enquanto o plano carrega ou o usuario
  // nao tem acesso — assim nada bate em /api antes da hora.
  const planAllowed = !isPlanLoading && hasAccess('CRAQUE')

  const buildParams = () => {
    const params = new URLSearchParams({ page: String(page) })
    if (typeFilter !== 'ALL') params.set('type', typeFilter)
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    return params
  }

  const { data, isLoading, error, refetch } = useQuery<DividendResponse>({
    queryKey: ['dividends', typeFilter, statusFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/dividends?${buildParams()}`)
      if (!res.ok) throw new Error('Erro ao carregar dividendos')
      const json = await res.json()
      return json.data
    },
    staleTime: 30_000,
    enabled: planAllowed,
  })

  const { data: allData } = useQuery<DividendResponse>({
    queryKey: ['dividends-summary'],
    queryFn: async () => {
      const res = await fetch('/api/v1/dividends?page=1&pageSize=100')
      if (!res.ok) return { items: [], meta: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } }
      const json = await res.json()
      return json.data
    },
    staleTime: 60_000,
    enabled: planAllowed,
  })

  // T-11: bloquear acesso para plano Jogador
  if (isPlanLoading) return <Spinner />
  if (!hasAccess('CRAQUE')) {
    return (
      <div data-testid="dividendos-upgrade-gate" className="min-h-screen bg-[#0B0E11] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-lg bg-[rgba(240,185,11,.15)] flex items-center justify-center mx-auto mb-4">
            <Lock className="h-8 w-8 text-[#F0B90B]" />
          </div>
          <h2 className="text-xl font-semibold text-[#EAECEF] mb-2">Dividendos disponíveis a partir do plano Craque</h2>
          <p className="text-sm text-[#929AA5] mb-6">Usuários Craque e Lenda recebem dividendos automaticamente no saldo.</p>
          <Link href="/planos" data-testid="dividendos-upgrade-cta">
            <Button className="w-full bg-[#F0B90B] hover:bg-[#D4A707] text-[#0c0b09] font-semibold">
              Ver planos
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const items = data?.items ?? []
  const meta = data?.meta
  const summaryItems = allData?.items ?? []

  return (
    <div className="min-h-screen bg-[#0B0E11] pb-8" data-testid="page-dividendos">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5" data-testid="dividendos-header">
          <div className="w-8 h-8 rounded-lg bg-[rgba(46,189,133,.15)] flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-[#2EBD85]" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[#EAECEF]">Dividendos</h1>
            <p className="text-xs text-[#929AA5]">Rendimentos das suas posições em 3 modalidades</p>
          </div>
        </div>

        {/* Summary cards */}
        <SummaryCards items={summaryItems} />

        {/* Type filters */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1" data-testid="dividendos-type-filters">
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => { setTypeFilter(f.value); setPage(1) }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                typeFilter === f.value
                  ? 'bg-[rgba(46,189,133,.15)] text-[#2EBD85] border border-[rgba(46,189,133,.4)]'
                  : 'bg-[#1E2329] text-[#929AA5] border border-transparent hover:text-[#EAECEF]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Status filters */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1" data-testid="dividendos-status-filters">
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
          <div className="space-y-2" aria-label="Carregando dividendos">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-[#1E2329] animate-pulse rounded-lg" />
            ))}
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <div className="text-center py-8" role="alert">
            <p className="text-sm text-[#929AA5] mb-3">Erro ao carregar dividendos</p>
            <Button variant="ghost" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && items.length === 0 && (
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
        {!isLoading && !error && items.length > 0 && (
          <div className="space-y-2" data-testid="dividendos-list" role="list" aria-label="Lista de dividendos">
            {items.map(d => (
              <DividendRow key={d.id} dividend={d} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 pt-4" data-testid="dividendos-pagination">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={!meta.hasPreviousPage}
              aria-label="Página anterior"
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
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
