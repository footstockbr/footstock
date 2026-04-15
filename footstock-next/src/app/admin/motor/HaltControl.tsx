'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldBan, ShieldCheck, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { hasAdminRole } from '@/lib/utils/admin-roles'
import type { AdminRole } from '@/types'

interface AssetHaltItem {
  id: string
  ticker: string
  displayName: string
  isHalted: boolean
  haltReason: string | null
}

async function fetchAssets(): Promise<AssetHaltItem[]> {
  const res = await fetch('/api/v1/admin/assets')
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

interface HaltControlProps {
  adminRole: AdminRole
}

/**
 * HaltControl — painel de controle de halt individual por ativo.
 * Permite RELEASE_HALT e FORCE_CIRCUIT_BREAKER por SuperAdmin/Administrador.
 */
export function HaltControl({ adminRole }: HaltControlProps) {
  const queryClient = useQueryClient()
  const canForce = hasAdminRole(adminRole, 'ADMINISTRADOR')
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [confirmAction, setConfirmAction] = useState<{
    ticker: string
    action: 'FORCE' | 'RELEASE'
  } | null>(null)

  const { data: assets, isLoading } = useQuery({
    queryKey: ['admin-assets-halt'],
    queryFn: fetchAssets,
    staleTime: 15_000,
    refetchInterval: 15_000,
  })

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const haltMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await fetch(`/api/v1/admin/assets/${ticker}/halt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'FORCE_CIRCUIT_BREAKER — admin manual' }),
      })
      if (!res.ok) throw new Error('Erro ao forçar circuit breaker')
      return res.json()
    },
    onSuccess: (_, ticker) => {
      showToast(`Circuit breaker forçado em ${ticker}`)
      queryClient.invalidateQueries({ queryKey: ['admin-assets-halt'] })
      queryClient.invalidateQueries({ queryKey: ['motor-kpis'] })
      setConfirmAction(null)
    },
    onError: (_, ticker) => showToast(`Erro ao forçar CB em ${ticker}`, 'err'),
  })

  const releaseMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const res = await fetch(`/api/v1/admin/assets/${ticker}/halt`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao liberar halt')
      return res.json()
    },
    onSuccess: (_, ticker) => {
      showToast(`Halt liberado: ${ticker}`)
      queryClient.invalidateQueries({ queryKey: ['admin-assets-halt'] })
      queryClient.invalidateQueries({ queryKey: ['motor-kpis'] })
      setConfirmAction(null)
    },
    onError: (_, ticker) => showToast(`Erro ao liberar ${ticker}`, 'err'),
  })

  const haltedAssets = (assets ?? []).filter((a) => a.isHalted)

  if (isLoading) {
    return (
      <div data-testid="halt-control" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <Skeleton className="h-5 w-48 mb-3" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-full mb-2" />)}
      </div>
    )
  }

  return (
    <div data-testid="halt-control" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 relative">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'absolute top-3 right-3 z-10 text-xs px-3 py-1.5 rounded-lg font-medium',
          toast.type === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        )}>
          {toast.msg}
        </div>
      )}

      {/* Modal de confirmação */}
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
                ? `Isso irá suspender imediatamente todas as negociações de ${confirmAction.ticker}. Todos os usuários com posições serão notificados.`
                : `Isso irá retomar imediatamente as negociações de ${confirmAction.ticker}.`}
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setConfirmAction(null)}
              >
                Cancelar
              </Button>
              <Button
                variant={confirmAction.action === 'FORCE' ? 'destructive' : 'primary'}
                size="sm"
                className={cn('flex-1', confirmAction.action === 'RELEASE' && 'bg-emerald-600 hover:bg-emerald-700')}
                onClick={() => {
                  if (confirmAction.action === 'FORCE') {
                    haltMutation.mutate(confirmAction.ticker)
                  } else {
                    releaseMutation.mutate(confirmAction.ticker)
                  }
                }}
                disabled={haltMutation.isPending || releaseMutation.isPending}
              >
                {haltMutation.isPending || releaseMutation.isPending
                  ? 'Aguarde...'
                  : confirmAction.action === 'FORCE'
                  ? 'Confirmar'
                  : 'Liberar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-[#EAECEF]">Controle de Halt</h3>
        {haltedAssets.length > 0 && (
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
            {haltedAssets.length} suspenso{haltedAssets.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {haltedAssets.length === 0 ? (
        <p className="text-xs text-[#929AA5] py-4 text-center">
          Nenhum ativo suspenso no momento
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          <p className="text-[11px] text-[#929AA5] mb-2">Ativos com halt ativo:</p>
          {haltedAssets.map((asset) => (
            <div
              key={asset.ticker}
              className="flex items-center gap-2 p-2 rounded-lg bg-red-900/10 border border-red-900/30"
            >
              <span className="font-mono text-xs font-semibold text-red-300">{asset.ticker}</span>
              <span className="text-[11px] text-[#929AA5] flex-1 truncate">{asset.haltReason ?? 'HALT'}</span>
              {canForce && (
                <button
                  onClick={() => setConfirmAction({ ticker: asset.ticker, action: 'RELEASE' })}
                  disabled={releaseMutation.isPending}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
                >
                  <ShieldCheck className="h-3 w-3" />
                  Liberar
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Ação de forçar circuit breaker */}
      {canForce && (
        <div className="border-t border-[rgba(240,185,11,.08)] pt-3">
          <p className="text-[11px] text-[#929AA5] mb-2">Forçar circuit breaker em ativo específico:</p>
          <ForceCircuitBreakerSelector
            assets={(assets ?? []).filter((a) => !a.isHalted)}
            onForce={(ticker) => setConfirmAction({ ticker, action: 'FORCE' })}
          />
        </div>
      )}
    </div>
  )
}

interface ForceSelectorProps {
  assets: AssetHaltItem[]
  onForce: (ticker: string) => void
}

function ForceCircuitBreakerSelector({ assets, onForce }: ForceSelectorProps) {
  const [selected, setSelected] = useState('')

  return (
    <div className="flex gap-2">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="flex-1 bg-[#0d1117] border border-[rgba(240,185,11,.2)] rounded px-2 py-1.5 text-xs text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
      >
        <option value="">Selecionar ativo...</option>
        {assets.map((a) => (
          <option key={a.ticker} value={a.ticker}>
            {a.ticker} — {a.displayName}
          </option>
        ))}
      </select>
      <button
        onClick={() => { if (selected) onForce(selected) }}
        disabled={!selected}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 border border-red-500/30 rounded hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Forçar circuit breaker manual"
      >
        <Zap className="h-3 w-3" />
        <ShieldBan className="h-3 w-3" />
        Forçar CB
      </button>
    </div>
  )
}
