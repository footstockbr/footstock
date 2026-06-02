'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { hasAdminRole } from '@/lib/utils/admin-roles'
import type { AdminRole } from '@/types'

interface AssetRow {
  id: string
  ticker: string
  displayName: string
  division: string
  currentPrice: number
  fairValue: number
  priceChange: number
  volume24h: number
  isHalted: boolean
  haltReason: string | null
  sentiment: string
  updatedAt: string
}

async function fetchAllAssets(): Promise<AssetRow[]> {
  const res = await fetch('/api/v1/admin/assets', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

const SENTIMENT_LABEL: Record<string, { label: string; color: string }> = {
  BULLISH: { label: 'Bullish', color: '#2EBD85' },
  BEARISH: { label: 'Bearish', color: '#F6465D' },
  NEUTRAL: { label: 'Neutro', color: '#929AA5' },
}

interface AssetsTableProps {
  adminRole: AdminRole
}

export function AssetsTable({ adminRole }: AssetsTableProps) {
  const queryClient = useQueryClient()
  const canHalt = hasAdminRole(adminRole, 'ADMINISTRADOR')
  const [confirmAction, setConfirmAction] = useState<{
    ticker: string
    action: 'FORCE' | 'RELEASE'
  } | null>(null)

  const { data: assets, isLoading, error } = useQuery({
    queryKey: ['admin-assets-full'],
    queryFn: fetchAllAssets,
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    if (type === 'ok') {
      toast.success(msg, { duration: 3000 })
    } else {
      toast.error(msg, { duration: 3000 })
    }
  }

  const haltMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await fetch(`/api/v1/admin/assets/${ticker}/halt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'FORCE_CIRCUIT_BREAKER — admin manual' }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Erro ao forçar circuit breaker')
      return res.json()
    },
    onSuccess: (_, ticker) => {
      showToast(`Circuit breaker forçado em ${ticker}`)
      queryClient.invalidateQueries({ queryKey: ['admin-assets-full'] })
      queryClient.invalidateQueries({ queryKey: ['motor-kpis'] })
      setConfirmAction(null)
    },
    onError: (_, ticker) => showToast(`Erro ao forçar CB em ${ticker}`, 'err'),
  })

  const releaseMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await fetch(`/api/v1/admin/assets/${ticker}/halt`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Erro ao liberar halt')
      return res.json()
    },
    onSuccess: (_, ticker) => {
      showToast(`Halt liberado: ${ticker}`)
      queryClient.invalidateQueries({ queryKey: ['admin-assets-full'] })
      queryClient.invalidateQueries({ queryKey: ['motor-kpis'] })
      setConfirmAction(null)
    },
    onError: (_, ticker) => showToast(`Erro ao liberar ${ticker}`, 'err'),
  })

  if (isLoading) {
    return (
      <div data-testid="admin-motor-assets-table" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <h3 className="text-sm font-semibold text-[#EAECEF] mb-3">Ativos — visão geral</h3>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="admin-motor-assets-table" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <p className="text-xs text-[#F6465D]">Erro ao carregar ativos</p>
      </div>
    )
  }

  const halted = (assets ?? []).filter((a) => a.isHalted).length

  return (
    <div data-testid="admin-motor-assets-table" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 relative">
      {/* Modal de confirmacao */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1a1816] rounded-xl border border-[rgba(240,185,11,.15)] p-6 max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-[#EAECEF] mb-2">
              {confirmAction.action === 'FORCE'
                ? `Forçar circuit breaker em ${confirmAction.ticker}`
                : `Liberar halt de ${confirmAction.ticker}`}
            </h4>
            <p className="text-sm text-[#929AA5] mb-5">
              {confirmAction.action === 'FORCE'
                ? `Isso irá suspender imediatamente todas as negociações de ${confirmAction.ticker}.`
                : `Isso irá retomar imediatamente as negociações de ${confirmAction.ticker}.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-3 py-1.5 text-xs text-[#929AA5] border border-[rgba(240,185,11,.1)] rounded hover:bg-[#1E2329] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (confirmAction.action === 'FORCE') {
                    haltMutation.mutate(confirmAction.ticker)
                  } else {
                    releaseMutation.mutate(confirmAction.ticker)
                  }
                }}
                disabled={haltMutation.isPending || releaseMutation.isPending}
                className={cn(
                  'flex-1 px-3 py-1.5 text-xs font-medium rounded disabled:opacity-40 transition-colors',
                  confirmAction.action === 'FORCE'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                )}
              >
                {haltMutation.isPending || releaseMutation.isPending
                  ? 'Aguarde...'
                  : confirmAction.action === 'FORCE'
                  ? 'Confirmar'
                  : 'Liberar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[#EAECEF]">
          Ativos — visão geral
          <span className="ml-2 text-[11px] font-normal text-[#929AA5]">
            {assets?.length ?? 0} ativos
          </span>
        </h3>
        {halted > 0 && (
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
            {halted} suspenso{halted > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]" aria-label="Todos os ativos">
          <thead>
            <tr className="border-b border-[rgba(240,185,11,.08)] text-[#929AA5]">
              <th className="text-left py-2 px-2 font-medium">Ticker</th>
              <th className="text-right py-2 px-2 font-medium">Preço atual</th>
              <th className="text-right py-2 px-2 font-medium">Desvio FV%</th>
              <th className="text-right py-2 px-2 font-medium">Volume 24h</th>
              <th className="text-center py-2 px-2 font-medium">Sentimento</th>
              <th className="text-center py-2 px-2 font-medium">Status</th>
              {canHalt && <th className="text-center py-2 px-2 font-medium w-[80px]">Ação</th>}
            </tr>
          </thead>
          <tbody>
            {(assets ?? []).map((asset) => {
              const deviationColor = asset.priceChange > 0 ? '#2EBD85' : asset.priceChange < 0 ? '#F6465D' : '#929AA5'
              const sentimentMeta = SENTIMENT_LABEL[asset.sentiment] ?? SENTIMENT_LABEL.NEUTRAL

              return (
                <tr
                  key={asset.id}
                  className={cn(
                    'border-b border-[rgba(240,185,11,.04)] last:border-0',
                    asset.isHalted ? 'bg-red-900/5' : 'hover:bg-[rgba(240,185,11,.02)]'
                  )}
                >
                  <td className="py-2 px-2">
                    <div className="font-mono font-semibold text-[#c5b99a]">{asset.ticker}</div>
                    <div className="text-[10px] text-[#707A8A] truncate max-w-[120px]">{asset.displayName}</div>
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-[#EAECEF]">
                    FS${asset.currentPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 px-2 text-right font-medium" style={{ color: deviationColor }}>
                    {asset.priceChange > 0 ? '+' : ''}{asset.priceChange.toFixed(2)}%
                  </td>
                  <td className="py-2 px-2 text-right text-[#929AA5]">
                    {asset.volume24h.toLocaleString('pt-BR')}
                  </td>
                  <td className="py-2 px-2 text-center">
                    <span className="text-[11px] font-medium" style={{ color: sentimentMeta.color }}>
                      {sentimentMeta.label}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-center">
                    {asset.isHalted ? (
                      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                        HALT
                      </span>
                    ) : (
                      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                        OK
                      </span>
                    )}
                  </td>
                  {canHalt && (
                    <td className="py-2 px-2 text-center">
                      {asset.isHalted ? (
                        <button
                          onClick={() => setConfirmAction({ ticker: asset.ticker, action: 'RELEASE' })}
                          disabled={releaseMutation.isPending}
                          className="inline-flex items-center gap-1 px-1.5 py-1 text-[10px] text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
                          title={`Liberar halt de ${asset.ticker}`}
                        >
                          <ShieldCheck className="h-3 w-3" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmAction({ ticker: asset.ticker, action: 'FORCE' })}
                          disabled={haltMutation.isPending}
                          className="inline-flex items-center gap-1 px-1.5 py-1 text-[10px] text-red-400/50 border border-red-500/15 rounded hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 disabled:opacity-40 transition-colors"
                          title={`Forçar circuit breaker em ${asset.ticker}`}
                        >
                          <Zap className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
