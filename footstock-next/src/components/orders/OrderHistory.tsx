'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

// ── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id: string
  type: string
  side: string
  quantity: number
  price: number | null
  status: string
  createdAt: string
  asset?: { ticker: string } | null
}

interface PaginatedOrders {
  data: Order[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const STATUS_FILTERS = ['ALL', 'OPEN', 'FILLED', 'CANCELLED', 'EXPIRED', 'PARTIAL'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'text-[#F0B90B]',
  FILLED: 'text-[#2EBD85]',
  CANCELLED: 'text-[#929AA5]',
  EXPIRED: 'text-[#707A8A]',
  PARTIAL: 'text-[#F0B90B]',
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  FILLED: 'Executada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
  PARTIAL: 'Parcial',
}

const TYPE_LABELS: Record<string, string> = {
  MARKET: 'Mercado',
  LIMIT: 'Limitada',
  OCO: 'OCO',
  SCHEDULED: 'Agendada',
  SHORT: 'Short',
}

// ── Component ────────────────────────────────────────────────────────────────

export function OrderHistory() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [page, setPage] = useState(1)
  const limit = 10

  const { data, isLoading } = useQuery<PaginatedOrders>({
    queryKey: ['orders', statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      const res = await fetch(`/api/v1/orders?${params}`)
      if (!res.ok) throw new Error('Erro ao carregar ordens')
      return res.json()
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/v1/orders/${orderId}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || 'Erro ao cancelar ordem')
      }
    },
    onSuccess: () => {
      toast.success('Ordem cancelada com sucesso!')
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar ordem.')
    },
  })

  const orders = data?.data ?? []
  const pagination = data?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 }

  return (
    <div className="space-y-4" data-testid="order-history">
      {/* Status filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              statusFilter === s
                ? 'bg-[rgba(240,185,11,.15)] text-[#F0B90B] border border-[rgba(240,185,11,.4)]'
                : 'bg-[#1E2329] text-[#929AA5] border border-transparent hover:text-[#EAECEF]'
            }`}
          >
            {s === 'ALL' ? 'Todas' : STATUS_LABELS[s] ?? s}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-[#1E2329] animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && orders.length === 0 && (
        <EmptyState
          title="Nenhuma ordem encontrada"
          description={statusFilter === 'ALL'
            ? 'Você ainda não enviou nenhuma ordem.'
            : `Nenhuma ordem com status "${STATUS_LABELS[statusFilter] ?? statusFilter}".`
          }
        />
      )}

      {/* Order list */}
      {!isLoading && orders.length > 0 && (
        <div className="space-y-2">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between bg-[#1E2329] rounded-lg px-4 py-3"
              data-testid={`order-row-${order.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[#EAECEF] font-medium text-sm">
                    {order.asset?.ticker ?? '—'}
                  </span>
                  <span className={`text-xs font-medium ${order.side === 'BUY' ? 'text-[#2EBD85]' : 'text-[#F6465D]'}`}>
                    {order.side === 'BUY' ? 'Compra' : 'Venda'}
                  </span>
                  <span className="text-xs text-[#707A8A]">
                    {TYPE_LABELS[order.type] ?? order.type}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-[#929AA5]">
                  <span>Qtd: {order.quantity}</span>
                  {order.price && <span>FS$ {Number(order.price).toFixed(2)}</span>}
                  <span>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${STATUS_COLORS[order.status] ?? 'text-[#929AA5]'}`}>
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
                {(order.status === 'OPEN' || order.status === 'PARTIAL') && (
                  <button
                    onClick={() => cancelMutation.mutate(order.id)}
                    disabled={cancelMutation.isPending}
                    className="p-1 rounded hover:bg-[rgba(246,70,93,.15)] text-[#F6465D] transition-colors"
                    aria-label="Cancelar ordem"
                    data-testid={`cancel-btn-${order.id}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-[#929AA5]">
            {page} / {pagination.totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
