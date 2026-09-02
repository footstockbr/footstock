'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, ChevronLeft, ChevronRight, ChevronDown, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import type { OrderHistoryDto } from '@/lib/contracts/order-history-contract'
import type { PnlProvenance } from '@/lib/contracts/transaction-contract'
import { pnlProvenanceLabel } from '@/lib/contracts/transaction-contract'

// ── Types ────────────────────────────────────────────────────────────────────

interface PaginatedOrders {
  data: OrderHistoryDto[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

const STATUS_FILTERS = ['ALL', 'OPEN', 'FILLED', 'CANCELLED', 'EXPIRED', 'PARTIAL'] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'text-warning',
  FILLED: 'text-success',
  CANCELLED: 'text-primary',
  EXPIRED: 'text-primary',
  PARTIAL: 'text-warning',
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  FILLED: 'Executada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
  PARTIAL: 'Parcial',
}

// Explicacao por status para o tooltip (title). PARTIAL confundia o usuario: significa
// que parte da ordem (tipicamente LIMIT) foi executada e o restante segue aberto no book.
const STATUS_TOOLTIPS: Record<string, string> = {
  PARTIAL: 'Parte da ordem foi executada; o restante continua aberto no mercado e pode ser cancelado.',
}

const TYPE_LABELS: Record<string, string> = {
  MARKET: 'Mercado',
  LIMIT: 'Limitada',
  OCO: 'OCO',
  SCHEDULED: 'Agendada',
  SHORT: 'Short',
}

// Origem da taxa exibida. `EXECUTED` veio da liquidacao, `ESTIMATED` e a
// estimativa gravada quando a ordem foi criada.
const FEE_KIND_LABELS: Record<string, string> = {
  EXECUTED: 'taxa cobrada',
  ESTIMATED: 'taxa estimada',
}

// Nota de procedencia dos numeros. Ordem legada sem liquidacao registrada nao
// pode aparecer como se tivesse numero conferido (regra Zero Assumido).
const FINANCIAL_SOURCE_NOTES: Record<string, string> = {
  TRADE: 'Valores conferidos na liquidação da ordem.',
  ORDER_FALLBACK:
    'Liquidação não registrada para esta ordem. Os valores abaixo são a estimativa feita na criação e podem diferir do que foi cobrado.',
  NONE: 'Esta ordem não foi executada, então não existem valores de liquidação.',
}

// Motivo do encerramento nao-executado (Fase 3, `Order.cancelReason`).
// Vocabulario fechado gravado pelo motor, pelos jobs de expiracao e pelo
// cancelamento do usuario; ver `docs/FASE3-ciclo-de-vida-da-ordem.md`. Codigo
// desconhecido (ordem legada ou motivo novo ainda nao mapeado) NAO e exibido
// cru para o usuario: a nota inteira some, porque codigo interno na tela nao
// informa nada e parece defeito.
const CANCEL_REASON_NOTES: Record<string, string> = {
  USER_REQUEST: 'Você cancelou esta ordem.',
  INSUFFICIENT_BALANCE: 'Saldo FS$ insuficiente no momento da execução.',
  ASSET_HALTED: 'Negociação do ativo foi suspensa antes da execução.',
  EXECUTION_RETRY_EXHAUSTED:
    'O motor tentou executar várias vezes e não conseguiu. A ordem foi cancelada para não ficar presa.',
  EXPIRED: 'A ordem expirou sem ser executada.',
  OCO_SIBLING: 'A outra ponta do par OCO foi encerrada, então esta foi cancelada junto.',
  PLAN_CANCELLED: 'Sua assinatura foi cancelada e as ordens pendentes foram encerradas.',
  RECONCILIATION: 'Ordem encerrada pela reconciliação: ficou presa sem avançar.',
}

// Rotulo unico de ausencia de dado. Nunca usar zero no lugar: FS$ 0,00 afirma
// que nao houve custo, e o que sabemos e que o dado nao existe.
const UNAVAILABLE = 'Indisponível'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFs(value: number | null): string {
  if (value === null || value === undefined) return UNAVAILABLE
  return `FS$ ${value.toFixed(2)}`
}

function formatSignedFs(value: number | null): string {
  if (value === null || value === undefined) return UNAVAILABLE
  return `${value >= 0 ? '+' : '-'}FS$ ${Math.abs(value).toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return UNAVAILABLE
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sideLabel(side: string): string {
  return side === 'BUY' ? 'Compra' : 'Venda'
}

// ── Detalhe (drill-down) ─────────────────────────────────────────────────────

function OrderDetails({ order }: { order: OrderHistoryDto }) {
  const isExecuted = order.financialSource !== 'NONE'
  const requestedPriceText =
    order.requestedPrice !== null
      ? formatFs(order.requestedPrice)
      : order.type === 'MARKET'
        ? 'Ordem a mercado (sem preço solicitado)'
        : UNAVAILABLE

  return (
    <div
      id={`order-details-${order.id}`}
      data-testid={`order-details-${order.id}`}
      role="region"
      aria-label={`Detalhes da ordem ${order.asset?.ticker ?? order.assetId}`}
      className="mt-3 border-t border-border pt-3"
    >
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-base">
        {/* Solicitado */}
        <div className="flex justify-between gap-3">
          <dt className="text-primary">Preço solicitado</dt>
          <dd className="text-primary">{requestedPriceText}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-primary">Enviada em</dt>
          <dd className="text-primary">{formatDateTime(order.createdAt)}</dd>
        </div>

        {/* Executado */}
        <div className="flex justify-between gap-3">
          <dt className="text-primary">Preço executado</dt>
          <dd className="text-primary" data-testid={`order-executed-price-${order.id}`}>
            {order.executedPrice !== null ? formatFs(order.executedPrice) : UNAVAILABLE}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-primary">Executada em</dt>
          <dd className="text-primary" data-testid={`order-executed-at-${order.id}`}>
            {formatDateTime(order.executedAt)}
          </dd>
        </div>

        {order.scheduledAt && (
          <div className="flex justify-between gap-3">
            <dt className="text-primary">Agendada para</dt>
            <dd className="text-primary">{formatDateTime(order.scheduledAt)}</dd>
          </div>
        )}

        {/* Financeiro */}
        <div className="flex justify-between gap-3">
          <dt className="text-primary">Valor bruto</dt>
          <dd className="text-primary" data-testid={`order-gross-${order.id}`}>
            {formatFs(order.grossAmount)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-primary">Taxa</dt>
          <dd className="text-primary" data-testid={`order-fee-${order.id}`}>
            {order.fee !== null
              ? `${formatFs(order.fee)} (${FEE_KIND_LABELS[order.feeKind ?? ''] ?? 'origem não informada'})`
              : UNAVAILABLE}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-primary">Valor líquido</dt>
          <dd
            className={
              order.netAmount === null
                ? 'text-primary'
                : order.netAmount >= 0
                  ? 'text-success'
                  : 'text-error'
            }
            data-testid={`order-net-${order.id}`}
          >
            {formatSignedFs(order.netAmount)}
          </dd>
        </div>
        {isExecuted && order.cashDelta !== null && (
          <div className="flex justify-between gap-3">
            <dt className="text-primary">Caixa movimentado</dt>
            <dd className="text-primary">{formatSignedFs(order.cashDelta)}</dd>
          </div>
        )}
        {isExecuted && (
          <div className="flex justify-between gap-3">
            <dt className="text-primary">Resultado realizado (bruto de taxas)</dt>
            <dd
              className={cn(
                'text-right',
                order.pnlProvenance === 'PERSISTED' && order.realizedPnl !== null
                  ? order.realizedPnl >= 0
                    ? 'text-success'
                    : 'text-error'
                  : 'text-primary',
              )}
              data-testid={`order-realized-pnl-${order.id}`}
            >
              {order.pnlProvenance === 'PERSISTED' && order.realizedPnl !== null
                ? formatSignedFs(order.realizedPnl)
                : pnlProvenanceLabel((order.pnlProvenance as PnlProvenance) ?? 'UNAVAILABLE')}
            </dd>
          </div>
        )}
      </dl>

      {order.cancelReason && CANCEL_REASON_NOTES[order.cancelReason] && (
        <p
          className="mt-2 text-base text-primary"
          data-testid={`order-cancel-reason-${order.id}`}
        >
          Motivo: {CANCEL_REASON_NOTES[order.cancelReason]}
        </p>
      )}

      <p className="mt-2 text-base text-primary">
        {FINANCIAL_SOURCE_NOTES[order.financialSource] ?? ''}
      </p>
      {isExecuted && (
        <p className="mt-1 text-base text-primary">
          Taxas sao contabilizadas em separado. O resultado realizado e bruto de taxas.
        </p>
      )}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function OrderHistory() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [page, setPage] = useState(1)
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  // Ordem PARTIAL exige confirmacao: cancelar nao desfaz a parte executada.
  const [pendingCancel, setPendingCancel] = useState<OrderHistoryDto | null>(null)
  const limit = 10

  const { data, isLoading, isError, refetch, isFetching } = useQuery<PaginatedOrders>({
    queryKey: ['orders', statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      const res = await fetch(`/api/v1/orders?${params}`)
      if (!res.ok) throw new Error('Erro ao carregar ordens')
      return res.json()
    },
    staleTime: 0,
    refetchOnMount: 'always',
    gcTime: 5 * 60 * 1000,
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

  function toggleExpanded(orderId: string) {
    setExpandedIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    )
  }

  function handleCancelClick(order: OrderHistoryDto) {
    // OPEN cancela em clique unico (nada foi executado, e reversivel na pratica).
    // PARTIAL abre confirmacao: parte do dinheiro ja mudou de mao.
    if (order.status === 'PARTIAL') {
      setPendingCancel(order)
      return
    }
    cancelMutation.mutate(order.id)
  }

  function confirmCancel() {
    if (!pendingCancel) return
    cancelMutation.mutate(pendingCancel.id)
    setPendingCancel(null)
  }

  return (
    <div className="space-y-4" data-testid="order-history">
      {/* Status filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`min-h-[44px] whitespace-nowrap rounded-md border px-3 py-2 text-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              statusFilter === s
                ? 'border-accent bg-elevated text-primary'
                : 'border-transparent bg-card text-primary hover:bg-elevated'
            }`}
          >
            {s === 'ALL' ? 'Todas' : STATUS_LABELS[s] ?? s}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-2" data-testid="order-history-loading" role="status">
          <span className="sr-only">Carregando suas ordens</span>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-[#1E2329] animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {/* Erro: nunca cair no estado vazio, que afirmaria que o usuario nao tem ordens */}
      {!isLoading && isError && (
        <div
          data-testid="order-history-error"
          role="alert"
          className="rounded-lg border border-error bg-card px-4 py-3"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-error mt-0.5 shrink-0" />
            <div className="space-y-2">
              <p className="text-base text-primary">
                Não foi possível carregar suas ordens. Isso é uma falha de carregamento, não quer
                dizer que você não tem ordens.
              </p>
              <Button
                variant="outline"
                size="sm"
                data-testid="order-history-retry"
                onClick={() => { void refetch() }}
                disabled={isFetching}
              >
                {isFetching ? 'Tentando...' : 'Tentar novamente'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && orders.length === 0 && (
        <div data-testid="order-history-empty">
          <EmptyState
            title="Nenhuma ordem encontrada"
            description={statusFilter === 'ALL'
              ? 'Você ainda não enviou nenhuma ordem.'
              : `Nenhuma ordem com status "${STATUS_LABELS[statusFilter] ?? statusFilter}".`
            }
          />
        </div>
      )}

      {/* Order list */}
      {!isLoading && !isError && orders.length > 0 && (
        <div className="space-y-2" data-testid="order-history-success">
          {orders.map((order) => {
            const isExpanded = expandedIds.includes(order.id)
            const ticker = order.asset?.ticker ?? '—'
            return (
              <div
                key={order.id}
                className="bg-card rounded-lg px-4 py-3"
                data-testid={`order-row-${order.id}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-primary font-medium text-base"
                        title={order.asset?.displayName ?? undefined}
                      >
                        {ticker}
                      </span>
                      <span className={`text-base font-medium ${order.side === 'BUY' ? 'text-success' : 'text-error'}`}>
                        {sideLabel(order.side)}
                      </span>
                      <span className="text-base text-primary">
                        {TYPE_LABELS[order.type] ?? order.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-base text-primary flex-wrap">
                      <span>Qtd: {order.quantity}</span>
                      {order.requestedPrice !== null && (
                        <span>Solicitado: {formatFs(order.requestedPrice)}</span>
                      )}
                      {order.executedPrice !== null && (
                        <span className="text-primary">
                          Executado: {formatFs(order.executedPrice)}
                        </span>
                      )}
                      <span>{formatDate(order.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-base font-medium ${STATUS_COLORS[order.status] ?? 'text-primary'}${STATUS_TOOLTIPS[order.status] ? ' cursor-help underline decoration-dotted underline-offset-2' : ''}`}
                      title={STATUS_TOOLTIPS[order.status]}
                      data-testid={`order-status-${order.id}`}
                    >
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>

                    <button
                      type="button"
                      onClick={() => toggleExpanded(order.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`order-details-${order.id}`}
                      aria-label={`${isExpanded ? 'Ocultar' : 'Ver'} detalhes da ordem ${ticker}`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-primary hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      data-testid={`order-row-expand-${order.id}`}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>

                    {(order.status === 'OPEN' || order.status === 'PARTIAL') && (
                      <button
                        type="button"
                        onClick={() => handleCancelClick(order)}
                        disabled={cancelMutation.isPending}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-error hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40"
                        aria-label="Cancelar ordem"
                        data-testid={`cancel-btn-${order.id}`}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && <OrderDetails order={order} />}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Página anterior"
            data-testid="order-history-prev"
            className="min-h-[44px] min-w-[44px]"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-md text-primary">
            {page} / {pagination.totalPages}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            aria-label="Próxima página"
            data-testid="order-history-next"
            className="min-h-[44px] min-w-[44px]"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Confirmacao de cancelamento de ordem PARTIAL */}
      {pendingCancel && (
        <Modal
          isOpen
          onClose={() => setPendingCancel(null)}
          title="Cancelar o saldo em aberto?"
          data-testid="cancel-confirm-dialog"
        >
          <div className="space-y-4">
            <p className="text-base text-primary">
              Ordem de {sideLabel(pendingCancel.side).toLowerCase()} de{' '}
              {pendingCancel.asset?.ticker ?? pendingCancel.assetId}.
            </p>
            <p className="text-base text-primary">
              Esta ordem já foi executada em parte. O cancelamento vale apenas para o saldo em
              aberto: a parte já executada não será desfeita.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="md"
                className="min-h-[44px]"
                onClick={() => setPendingCancel(null)}
                data-testid="cancel-dismiss-btn"
              >
                Manter ordem
              </Button>
              <Button
                variant="destructive"
                size="md"
                className="min-h-[44px]"
                onClick={confirmCancel}
                disabled={cancelMutation.isPending}
                data-testid="cancel-confirm-btn"
              >
                Cancelar saldo em aberto
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
