'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { getGatewayMeta } from '@/lib/constants/admin-ui'
import { formatDateTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils'

// ── Tipos (espelham WebhookAuditService.listLogs) ────────────────────────────

interface WebhookLog {
  id: string
  gateway: string
  eventType: string | null
  transactionId: string | null
  subscriptionId: string | null
  status: string
  hmacValid: boolean
  ipAddress: string | null
  errorMessage: string | null
  processedAt: string
}

interface WebhookLogsResponse {
  data: WebhookLog[]
  meta: { total: number; page: number; limit: number; pages: number }
}

interface ReplayResult {
  ok: boolean
  action?: string
  reason?: string
  detail?: string
}

// ── Query keys compartilhadas (reusadas pelo badge da aba no PageClient) ──────

export const WEBHOOKS_REJECTED_KEY = ['admin-webhooks-rejected'] as const
export const WEBHOOKS_REJECTED_24H_KEY = ['admin-webhooks-rejected-24h'] as const

// ── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchRejectedWebhooks(): Promise<WebhookLogsResponse> {
  const res = await fetch('/api/v1/admin/webhooks/logs?status=REJECTED&limit=50', {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed')
  return res.json()
}

/**
 * Conta REJECTED nas ultimas 24h via meta.total (limit=1, sem trafegar a lista).
 * O corte de 24h e computado aqui (fora do render, ja que isto e o queryFn do
 * react-query) -> janela deslizante a cada refetch, render puro.
 */
export async function fetchRejected24hCount(): Promise<number> {
  const dateFromIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const params = new URLSearchParams({ status: 'REJECTED', dateFrom: dateFromIso, limit: '1' })
  const res = await fetch(`/api/v1/admin/webhooks/logs?${params}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const json: WebhookLogsResponse = await res.json()
  return json.meta?.total ?? 0
}

async function replayWebhook(transactionId: string): Promise<ReplayResult> {
  const res = await fetch('/api/v1/admin/payments/replay', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gateway: 'MERCADO_PAGO', paymentId: transactionId }),
  })
  const json = await res.json().catch(() => ({}))
  // Endpoint retorna { data: ReplayResult } com status 200 (ok) ou 422 (falha).
  const result: ReplayResult = json?.data ?? { ok: false, reason: json?.error?.message ?? 'Erro desconhecido' }
  if (!res.ok && !json?.data) {
    throw new Error(json?.error?.message ?? 'Falha na requisicao de replay')
  }
  return result
}

// ── Componente ────────────────────────────────────────────────────────────────

export function FinanceiroWebhooks() {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: WEBHOOKS_REJECTED_KEY,
    queryFn: fetchRejectedWebhooks,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: count24h } = useQuery({
    queryKey: WEBHOOKS_REJECTED_24H_KEY,
    queryFn: fetchRejected24hCount,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const replayMutation = useMutation({
    mutationFn: replayWebhook,
    onSuccess: (result, transactionId) => {
      if (result.ok) {
        toast.success(`Replay aplicado (${result.action ?? 'reconciliado'}) para ${transactionId.slice(0, 12)}`)
      } else {
        toast.error(`Replay nao reconciliou: ${result.reason ?? 'motivo desconhecido'}${result.detail ? ` (${result.detail})` : ''}`)
      }
      // O proprio replay grava um novo audit log; refrescar lista + badge.
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_REJECTED_KEY })
      queryClient.invalidateQueries({ queryKey: WEBHOOKS_REJECTED_24H_KEY })
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erro de rede ao tentar o replay. Tente novamente.')
    },
  })

  const logs = data?.data ?? []

  return (
    <div data-testid="admin-financeiro-webhooks" className="space-y-3">
      {/* Cabecalho da sub-aba + badge 24h */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-[#EAECEF]">Webhooks rejeitados</h2>
          <span
            data-testid="admin-financeiro-webhooks-badge-24h"
            className={cn(
              'px-2 py-0.5 rounded text-[10px] font-bold',
              (count24h ?? 0) > 0
                ? 'bg-[#F6465D]/15 text-[#F6465D]'
                : 'bg-[#2EBD85]/15 text-[#2EBD85]'
            )}
          >
            {count24h ?? 0} nas ultimas 24h
          </span>
        </div>
        {data && (
          <span className="text-xs text-[#929AA5] self-center ml-auto">
            {data.meta.total} rejeitados no total
          </span>
        )}
      </div>

      <p className="text-[11px] text-[#929AA5]">
        Pagamentos cujo webhook foi rejeitado (HMAC invalido, timestamp expirado ou template divergente).
        Use o replay para reconciliar manualmente um pagamento Mercado Pago aprovado que nao ativou o plano.
      </p>

      {/* Tabela / estados */}
      <div
        data-testid="admin-financeiro-webhooks-table-container"
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] overflow-x-auto"
      >
        {isLoading ? (
          <div data-testid="admin-financeiro-webhooks-loading" className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : error ? (
          <div data-testid="admin-financeiro-webhooks-error" className="p-6 text-center space-y-3">
            <p className="text-xs text-[#F6465D]">Erro ao carregar webhooks rejeitados</p>
            <Button
              variant="secondary"
              size="sm"
              className="text-[10px]"
              onClick={() => refetch()}
              data-testid="admin-financeiro-webhooks-retry-button"
            >
              Tentar novamente
            </Button>
          </div>
        ) : !logs.length ? (
          <div data-testid="admin-financeiro-webhooks-empty" className="p-6 text-center text-xs text-[#929AA5]">
            Nenhum webhook rejeitado registrado. Tudo certo por aqui.
          </div>
        ) : (
          <table data-testid="admin-financeiro-webhooks-table" className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="text-[#929AA5] border-b border-[rgba(240,185,11,.08)]">
                <th className="text-left py-2.5 px-3 font-medium">Data</th>
                <th className="text-left py-2.5 px-3 font-medium">Gateway</th>
                <th className="text-left py-2.5 px-3 font-medium">Evento</th>
                <th className="text-left py-2.5 px-3 font-medium">Transacao</th>
                <th className="text-left py-2.5 px-3 font-medium">Motivo</th>
                <th className="text-right py-2.5 px-3 font-medium">Acao</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const meta = getGatewayMeta(log.gateway)
                const canReplay = log.gateway === 'MERCADO_PAGO' && !!log.transactionId
                const isReplaying =
                  replayMutation.isPending && replayMutation.variables === log.transactionId
                return (
                  <tr
                    key={log.id}
                    data-testid={`admin-financeiro-webhook-row-${log.id}`}
                    className="border-b border-[rgba(240,185,11,.05)] last:border-0 hover:bg-[rgba(240,185,11,.03)] transition-colors align-top"
                  >
                    <td className="py-2.5 px-3 text-[#929AA5] whitespace-nowrap">
                      {formatDateTime(log.processedAt)}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span style={{ color: meta.color }} className="font-semibold">
                        {meta.emoji} {meta.label}
                      </span>
                      {!log.hmacValid && (
                        <span className="ml-1 text-[9px] text-[#F6465D] font-bold">HMAC</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[#EAECEF] whitespace-nowrap">
                      {log.eventType ?? '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[10px] text-[#c5b99a] break-all max-w-[160px]">
                      {log.transactionId ?? '—'}
                    </td>
                    <td className="py-2.5 px-3 text-[#929AA5] max-w-[240px]">
                      {log.errorMessage ?? '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {canReplay ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="text-[10px]"
                          disabled={replayMutation.isPending}
                          onClick={() => replayMutation.mutate(log.transactionId as string)}
                          data-testid={`admin-financeiro-webhook-replay-${log.id}-button`}
                        >
                          {isReplaying ? 'Reprocessando...' : 'Replay'}
                        </Button>
                      ) : (
                        <span className="text-[10px] text-[#929AA5]">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
