'use client'
// ============================================================================
// Foot Stock — ClubEditor
// Tabela de 40 ativos com toggle halt/liberar e modal de confirmação.
// Rastreabilidade: INT-086, TASK-3/ST007
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import { authedFetch } from '@/lib/api/authed-fetch'
import { ShieldBan, ShieldCheck, Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface AssetItem {
  id: string
  ticker: string
  displayName: string
  division: string
  currentPrice: number
  priceChange: number
  isHalted: boolean
  haltReason: string | null
}

interface ToastState {
  msg: string
  type: 'ok' | 'err'
}

interface ClubEditorProps {
  canHalt: boolean
}

export function ClubEditor({ canHalt }: ClubEditorProps) {
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showOnlyHalted, setShowOnlyHalted] = useState(false)
  const [confirmTicker, setConfirmTicker] = useState<string | null>(null)
  const [haltReasonInput, setHaltReasonInput] = useState('')
  const [pendingTicker, setPendingTicker] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = (msg: string, type: ToastState['type'] = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadAssets = useCallback(async () => {
    try {
      const res = await authedFetch('/api/v1/admin/assets')
      if (!res.ok) throw new Error('Failed')
      const json = await res.json()
      setAssets(json.data)
    } catch {
      showToast('Erro ao carregar ativos', 'err')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadAssets() }, [loadAssets])

  const haltAsset = async (ticker: string) => {
    setPendingTicker(ticker)
    try {
      const reason = haltReasonInput.trim() || 'Halt manual via painel admin'
      const res = await authedFetch(`/api/v1/admin/motor/halt/${ticker}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) throw new Error()
      showToast(`${ticker} suspenso com sucesso`)
      setConfirmTicker(null)
      setHaltReasonInput('')
      await loadAssets()
    } catch {
      showToast(`Erro ao suspender ${ticker}`, 'err')
    } finally {
      setPendingTicker(null)
    }
  }

  const releaseAsset = async (ticker: string) => {
    setPendingTicker(ticker)
    try {
      const res = await authedFetch(`/api/v1/admin/motor/halt/${ticker}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      showToast(`${ticker} liberado`)
      await loadAssets()
    } catch {
      showToast(`Erro ao liberar ${ticker}`, 'err')
    } finally {
      setPendingTicker(null)
    }
  }

  const displayed = showOnlyHalted ? assets.filter(a => a.isHalted) : assets

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="skeleton mb-3 h-5 w-32 rounded" aria-hidden="true" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton mb-2 h-9 w-full rounded" aria-hidden="true" />
        ))}
      </div>
    )
  }

  return (
    <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            'absolute right-3 top-3 z-10 rounded-lg px-3 py-1.5 text-xs font-medium',
            toast.type === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          )}
        >
          {toast.msg}
        </div>
      )}

      {/* Modal de confirmação */}
      {confirmTicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-halt-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <div className="mb-4 flex items-start justify-between">
              <h4 id="confirm-halt-title" className="text-base font-semibold text-zinc-100">
                Confirmar suspensão
              </h4>
              <button
                onClick={() => { setConfirmTicker(null); setHaltReasonInput('') }}
                className="rounded p-1 text-zinc-500 hover:text-zinc-100"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mb-4 text-sm text-zinc-400">
              Tem certeza que deseja{' '}
              <strong className="text-red-400">SUSPENDER</strong> o ticker{' '}
              <strong className="font-mono text-zinc-100">{confirmTicker}</strong>?{' '}
              Todos os trades serão suspensos imediatamente.
            </p>
            <div className="mb-5">
              <label htmlFor="halt-reason" className="mb-1.5 block text-xs font-medium text-zinc-300">
                Motivo da suspensão <span className="text-zinc-500">(opcional)</span>
              </label>
              <textarea
                id="halt-reason"
                rows={2}
                value={haltReasonInput}
                onChange={(e) => setHaltReasonInput(e.target.value)}
                placeholder="Halt manual via painel admin"
                className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#F0B90B]"
                maxLength={255}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setConfirmTicker(null); setHaltReasonInput('') }}
                className="flex-1 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 min-h-[44px]"
              >
                Cancelar
              </button>
              <button
                onClick={() => haltAsset(confirmTicker)}
                disabled={pendingTicker === confirmTicker}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
              >
                {pendingTicker === confirmTicker ? 'Suspendendo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-sm font-semibold text-zinc-100">Ativos ({assets.length})</h3>
        <button
          onClick={() => setShowOnlyHalted(v => !v)}
          className={cn(
            'ml-auto flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors',
            showOnlyHalted
              ? 'border-red-500/30 bg-red-500/20 text-red-400'
              : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
          )}
          aria-pressed={showOnlyHalted}
        >
          <Filter size={12} />
          {showOnlyHalted ? 'Mostrar todos' : 'Apenas suspensos'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg">
        <table className="w-full min-w-[560px] text-xs" aria-label="Tabela de ativos administrados">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-zinc-500">
              <th className="px-2 py-2 font-medium">Ticker</th>
              <th className="hidden px-2 py-2 font-medium sm:table-cell">Divisão</th>
              <th className="px-2 py-2 text-right font-medium">Preço</th>
              <th className="px-2 py-2 text-right font-medium">Var%</th>
              <th className="px-2 py-2 text-center font-medium">Status</th>
              <th className="px-2 py-2 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(asset => (
              <tr
                key={asset.ticker}
                className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30"
              >
                <td className="px-2 py-2.5 font-mono font-semibold text-zinc-200">{asset.ticker}</td>
                <td className="hidden px-2 py-2.5 text-zinc-500 sm:table-cell">{asset.division}</td>
                <td className="px-2 py-2.5 text-right text-zinc-300">
                  FS$ {asset.currentPrice.toFixed(2)}
                </td>
                <td
                  className={cn(
                    'px-2 py-2.5 text-right font-medium',
                    asset.priceChange > 0
                      ? 'text-emerald-400'
                      : asset.priceChange < 0
                      ? 'text-red-400'
                      : 'text-zinc-500'
                  )}
                >
                  {asset.priceChange > 0 ? '+' : ''}
                  {asset.priceChange.toFixed(2)}%
                </td>
                <td className="px-2 py-2.5 text-center">
                  <span
                    className={cn(
                      'rounded border px-1.5 py-0.5 text-[11px] font-medium',
                      asset.isHalted
                        ? 'border-red-500/30 bg-red-500/20 text-red-400'
                        : 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400'
                    )}
                  >
                    {asset.isHalted ? 'Suspenso' : 'Ativo'}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right">
                  {asset.isHalted ? (
                    <button
                      onClick={() => releaseAsset(asset.ticker)}
                      disabled={!canHalt || pendingTicker === asset.ticker}
                      title={!canHalt ? 'Sem permissão' : undefined}
                      className="inline-flex min-h-[36px] min-w-[36px] items-center gap-1 rounded-lg border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Liberar ${asset.ticker}`}
                    >
                      <ShieldCheck size={14} />
                      Liberar
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmTicker(asset.ticker)}
                      disabled={!canHalt}
                      title={!canHalt ? 'Sem permissão' : undefined}
                      className="inline-flex min-h-[36px] min-w-[36px] items-center gap-1 rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Suspender ${asset.ticker}`}
                    >
                      <ShieldBan size={14} />
                      Suspender
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {displayed.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-6 text-center text-zinc-500">
                  Nenhum ativo encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
