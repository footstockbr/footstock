'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBRLValue } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

interface PaymentItem {
  id: string
  userId: string
  userName: string | null
  userEmail: string | null
  subscriptionId: string | null
  planType: string | null
  period: string | null
  amount: number
  gateway: string
  gatewayTransactionId: string | null
  status: string
  processedAt: string | null
  createdAt: string
}

interface RecentPaymentsResponse {
  items: PaymentItem[]
  total: number
  limit: number
  offset: number
}

const STATUS_STYLE: Record<string, string> = {
  PAID:     'bg-emerald-500/15 text-emerald-400',
  PENDING:  'bg-yellow-500/15 text-yellow-400',
  FAILED:   'bg-red-500/15 text-red-400',
  REFUNDED: 'bg-blue-500/15 text-blue-400',
}

const PLAN_STYLE: Record<string, string> = {
  CRAQUE: 'text-[#F0B90B]',
  LENDA:  'text-[#c084fc]',
  JOGADOR: 'text-[#929AA5]',
}

const GATEWAY_LABELS: Record<string, string> = {
  MERCADO_PAGO: 'MP',
  PAGSEGURO:    'PS',
  PAYPAL:       'PP',
}

async function fetchRecent(status?: string, gateway?: string): Promise<RecentPaymentsResponse> {
  const params = new URLSearchParams({ limit: '50' })
  if (status)  params.set('status', status)
  if (gateway) params.set('gateway', gateway)
  const res = await fetch(`/api/v1/admin/payments/recent?${params}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

export function FinanceiroMovimentacoes() {
  const [statusFilter,  setStatusFilter]  = useState('')
  const [gatewayFilter, setGatewayFilter] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments-recent', statusFilter, gatewayFilter],
    queryFn:  () => fetchRecent(statusFilter || undefined, gatewayFilter || undefined),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return (
    <div data-testid="admin-financeiro-movimentacoes" className="space-y-3">
      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          data-testid="admin-financeiro-mov-status-filter"
          className="bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded text-xs text-[#EAECEF] px-2 py-1.5 outline-none focus:border-[rgba(240,185,11,.4)]"
        >
          <option value="">Todos os status</option>
          <option value="PAID">Pago</option>
          <option value="PENDING">Pendente</option>
          <option value="FAILED">Falhou</option>
          <option value="REFUNDED">Reembolsado</option>
        </select>

        <select
          value={gatewayFilter}
          onChange={(e) => setGatewayFilter(e.target.value)}
          data-testid="admin-financeiro-mov-gateway-filter"
          className="bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded text-xs text-[#EAECEF] px-2 py-1.5 outline-none focus:border-[rgba(240,185,11,.4)]"
        >
          <option value="">Todos os gateways</option>
          <option value="MERCADO_PAGO">Mercado Pago</option>
          <option value="PAGSEGURO">PagSeguro</option>
          <option value="PAYPAL">PayPal</option>
        </select>

        {(statusFilter || gatewayFilter) && (
          <button
            type="button"
            onClick={() => { setStatusFilter(''); setGatewayFilter('') }}
            className="text-xs text-[#929AA5] hover:text-[#EAECEF] px-2"
          >
            Limpar
          </button>
        )}

        {data && (
          <span className="text-xs text-[#929AA5] self-center ml-auto">
            {data.total} movimentações
          </span>
        )}
      </div>

      {/* Tabela */}
      <div
        data-testid="admin-financeiro-movimentacoes-table-container"
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] overflow-x-auto"
      >
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-[#F6465D]">
            Erro ao carregar movimentações
          </div>
        ) : !data?.items.length ? (
          <div className="p-6 text-center text-xs text-[#929AA5]">
            Nenhuma movimentação encontrada
          </div>
        ) : (
          <table data-testid="admin-financeiro-movimentacoes-table" className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-[#929AA5] border-b border-[rgba(240,185,11,.08)]">
                <th className="text-left py-2.5 px-3 font-medium">Data</th>
                <th className="text-left py-2.5 px-3 font-medium">Usuário</th>
                <th className="text-left py-2.5 px-3 font-medium">Plano</th>
                <th className="text-left py-2.5 px-3 font-medium">Gateway</th>
                <th className="text-right py-2.5 px-3 font-medium">Valor</th>
                <th className="text-left py-2.5 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr
                  key={p.id}
                  data-testid={`admin-financeiro-mov-row-${p.id}`}
                  className="border-b border-[rgba(240,185,11,.05)] last:border-0 hover:bg-[rgba(240,185,11,.03)] transition-colors"
                >
                  <td className="py-2.5 px-3 text-[#929AA5] whitespace-nowrap">
                    {new Date(p.createdAt).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="text-[#EAECEF] font-medium">{p.userName ?? '—'}</div>
                    <div className="text-[#929AA5] text-[10px]">{p.userEmail ?? p.userId.slice(0, 12)}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={cn('font-semibold', PLAN_STYLE[p.planType ?? ''] ?? 'text-[#929AA5]')}>
                      {p.planType ?? '—'}
                    </span>
                    {p.period && (
                      <span className="ml-1 text-[#929AA5] text-[10px]">
                        {p.period === 'MONTHLY' ? '/mês' : '/ano'}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="bg-[rgba(240,185,11,.08)] text-[#c5b99a] text-[10px] font-mono px-1.5 py-0.5 rounded">
                      {GATEWAY_LABELS[p.gateway] ?? p.gateway}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-[#EAECEF] whitespace-nowrap">
                    R${formatBRLValue(p.amount / 100)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                      STATUS_STYLE[p.status] ?? 'bg-zinc-700/30 text-zinc-400'
                    )}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
