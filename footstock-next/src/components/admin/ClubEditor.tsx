'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ShieldBan, ShieldCheck, Filter, SlidersHorizontal, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AliasManagement } from '@/components/admin/AliasManagement'

interface AssetItem {
  id: string
  ticker: string
  displayName: string
  realName: string | null
  division: string
  currentPrice: number
  priceChange: number
  isHalted: boolean
  haltReason: string | null
  sentiment: string
}

async function fetchAssets(): Promise<AssetItem[]> {
  const res = await fetch('/api/v1/admin/assets', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

interface ClubEditorProps {
  canHalt: boolean // baseado no role do admin
}

export function ClubEditor({ canHalt }: ClubEditorProps) {
  const queryClient = useQueryClient()
  const [showOnlyHalted, setShowOnlyHalted] = useState(false)
  const [confirmTicker, setConfirmTicker] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  // ADJUST_PRICE state
  const [adjustAsset, setAdjustAsset] = useState<{ id: string; ticker: string; currentPrice: number } | null>(null)
  const [adjustPrice, setAdjustPrice] = useState('')
  const [adjustReason, setAdjustReason] = useState('')

  // Aliases panel: qual ticker está expandido
  const [aliasTickerOpen, setAliasTickerOpen] = useState<string | null>(null)

  const { data: assets, isLoading } = useQuery({
    queryKey: ['admin-assets'],
    queryFn: fetchAssets,
    staleTime: 30_000,
  })

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const haltMutation = useMutation({
    mutationFn: (ticker: string) =>
      fetch(`/api/v1/admin/assets/${ticker}/halt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Halt manual via painel admin' }),
      }).then((r) => { if (!r.ok) throw new Error('Erro ao haltear'); return r.json() }),
    onSuccess: (_, ticker) => {
      showToast(`${ticker} halted com sucesso`)
      queryClient.invalidateQueries({ queryKey: ['admin-assets'] })
      setConfirmTicker(null)
    },
    onError: (_, ticker) => showToast(`Erro ao haltear ${ticker}`, 'err'),
  })

  const releaseMutation = useMutation({
    mutationFn: (ticker: string) =>
      fetch(`/api/v1/admin/assets/${ticker}/halt`, { method: 'DELETE' })
        .then((r) => { if (!r.ok) throw new Error('Erro ao liberar'); return r.json() }),
    onSuccess: (_, ticker) => {
      showToast(`${ticker} liberado`)
      queryClient.invalidateQueries({ queryKey: ['admin-assets'] })
    },
    onError: (_, ticker) => showToast(`Erro ao liberar ${ticker}`, 'err'),
  })

  const adjustMutation = useMutation({
    mutationFn: ({ assetId, newPrice, reason }: { assetId: string; newPrice: number; reason: string }) =>
      fetch('/api/v1/admin/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ADJUST_PRICE', assetId, reason, payload: { newPrice } }),
      }).then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body?.error ?? `HTTP ${r.status}`)
        }
        return r.json()
      }),
    onSuccess: () => {
      showToast(`Preço de ${adjustAsset?.ticker} ajustado com sucesso`)
      queryClient.invalidateQueries({ queryKey: ['admin-assets'] })
      setAdjustAsset(null)
      setAdjustPrice('')
      setAdjustReason('')
    },
    onError: (err) => showToast(`Erro ao ajustar preço: ${(err as Error).message}`, 'err'),
  })

  function openAdjustModal(asset: AssetItem) {
    setAdjustAsset({ id: asset.id, ticker: asset.ticker, currentPrice: asset.currentPrice })
    setAdjustPrice(asset.currentPrice.toFixed(2))
    setAdjustReason('')
  }

  function submitAdjust() {
    if (!adjustAsset) return
    const newPrice = parseFloat(adjustPrice)
    if (isNaN(newPrice) || newPrice < 5) {
      showToast('Preço inválido (mínimo FS$5.00)', 'err')
      return
    }
    if (adjustReason.trim().length < 10) {
      showToast('Motivo deve ter ao menos 10 caracteres', 'err')
      return
    }
    adjustMutation.mutate({ assetId: adjustAsset.id, newPrice, reason: adjustReason.trim() })
  }

  const displayed = showOnlyHalted ? (assets ?? []).filter((a) => a.isHalted) : (assets ?? [])

  if (isLoading) {
    return (
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <Skeleton className="h-5 w-32 mb-3" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full mb-2" />)}
      </div>
    )
  }

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 relative">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'absolute top-3 right-3 z-10 text-xs px-3 py-1.5 rounded-lg font-medium',
          toast.type === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
        )}>
          {toast.msg}
        </div>
      )}

      {/* Modal de confirmação de halt */}
      {confirmTicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1a1816] rounded-xl border border-[rgba(240,185,11,.15)] p-6 max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-[#EAECEF] mb-2">
              Confirmar halt de {confirmTicker}
            </h4>
            <p className="text-sm text-[#929AA5] mb-5">
              Tem certeza que deseja <strong className="text-red-400">HALTEAR</strong> o ticker{' '}
              <strong>{confirmTicker}</strong>? Todos os trades serão suspensos imediatamente.
            </p>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setConfirmTicker(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => haltMutation.mutate(confirmTicker)}
                disabled={haltMutation.isPending}
              >
                Confirmar Halt
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de ajuste de preço */}
      {adjustAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#1a1816] rounded-xl border border-[rgba(240,185,11,.15)] p-6 max-w-sm w-full mx-4">
            <h4 className="text-base font-semibold text-[#EAECEF] mb-1">
              Ajustar preço — {adjustAsset.ticker}
            </h4>
            <p className="text-xs text-[#929AA5] mb-4">
              Preço atual: <span className="text-[#c5b99a] font-mono">FS$ {adjustAsset.currentPrice.toFixed(2)}</span>.
              O ajuste atualiza o motor e o banco simultaneamente.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs text-[#929AA5] mb-1">Novo preço (FS$)</label>
                <input
                  type="number"
                  min="5"
                  step="0.01"
                  value={adjustPrice}
                  onChange={(e) => setAdjustPrice(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[rgba(240,185,11,.2)] rounded-lg px-3 py-2 text-sm text-[#EAECEF] font-mono focus:outline-none focus:border-[#F0B90B]"
                  placeholder="Ex: 23.55"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-[#929AA5] mb-1">Motivo (mín. 10 chars)</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[rgba(240,185,11,.2)] rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
                  placeholder="Ex: Recuperação pós-crash motor"
                  maxLength={200}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => { setAdjustAsset(null); setAdjustPrice(''); setAdjustReason('') }}
                disabled={adjustMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-[#F0B90B] hover:bg-[#d4a309] text-black font-semibold"
                onClick={submitAdjust}
                disabled={adjustMutation.isPending}
              >
                {adjustMutation.isPending ? 'Ajustando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-3">
        <h3 className="text-sm font-semibold text-[#EAECEF]">Ativos ({assets?.length ?? 0})</h3>
        <button
          onClick={() => setShowOnlyHalted((v) => !v)}
          className={cn(
            'ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
            showOnlyHalted
              ? 'bg-red-500/20 text-red-400 border-red-500/30'
              : 'text-[#929AA5] border-[rgba(240,185,11,.1)] hover:text-[#c5b99a]'
          )}
        >
          <Filter className="h-3 w-3" />
          {showOnlyHalted ? 'Mostrar todos' : 'Apenas halted'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="text-[#929AA5] border-b border-[rgba(240,185,11,.08)]">
              <th className="text-left py-2 px-2 font-medium">Ticker / Clube Real</th>
              <th className="text-left py-2 px-2 font-medium hidden md:table-cell">Nome Fictício</th>
              <th className="text-left py-2 px-2 font-medium hidden sm:table-cell">Divisão</th>
              <th className="text-right py-2 px-2 font-medium">Preço</th>
              <th className="text-right py-2 px-2 font-medium">Var%</th>
              <th className="text-center py-2 px-2 font-medium">Status</th>
              <th className="text-right py-2 px-2 font-medium">Halt</th>
              <th className="text-right py-2 px-2 font-medium">Preço</th>
              <th className="text-center py-2 px-2 font-medium">Aliases</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((asset) => {
              const isAliasOpen = aliasTickerOpen === asset.ticker
              return (
                <tr
                  key={asset.ticker}
                  className="border-b border-[rgba(240,185,11,.06)] last:border-0 hover:bg-[rgba(240,185,11,.03)]"
                >
                  <td className="py-2.5 px-2">
                    <span className="font-mono font-semibold text-[#c5b99a]">{asset.ticker}</span>
                    {asset.realName && (
                      <p className="text-[10px] text-[#707A8A] mt-0.5">{asset.realName}</p>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-[#929AA5] text-xs hidden md:table-cell">
                    {asset.displayName}
                  </td>
                  <td className="py-2.5 px-2 text-[#929AA5] hidden sm:table-cell">{asset.division}</td>
                  <td className="py-2.5 px-2 text-right text-[#c5b99a]">
                    FS$ {asset.currentPrice.toFixed(2)}
                  </td>
                  <td className={cn(
                    'py-2.5 px-2 text-right font-medium',
                    asset.priceChange > 0 ? 'text-emerald-400' : asset.priceChange < 0 ? 'text-red-400' : 'text-[#929AA5]'
                  )}>
                    {asset.priceChange > 0 ? '+' : ''}{asset.priceChange.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className={cn(
                      'text-[11px] font-medium px-1.5 py-0.5 rounded border',
                      asset.isHalted
                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    )}>
                      {asset.isHalted ? 'Halted' : 'Ativo'}
                    </span>
                  </td>
                  {/* Halt / Release */}
                  <td className="py-2.5 px-2 text-right">
                    {asset.isHalted ? (
                      <button
                        onClick={() => releaseMutation.mutate(asset.ticker)}
                        disabled={!canHalt || releaseMutation.isPending}
                        title={!canHalt ? 'Sem permissão' : undefined}
                        className="min-h-[36px] min-w-[36px] inline-flex items-center gap-1 px-2.5 py-1 text-xs text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Liberar
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmTicker(asset.ticker)}
                        disabled={!canHalt}
                        title={!canHalt ? 'Sem permissão' : undefined}
                        className="min-h-[36px] min-w-[36px] inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <ShieldBan className="h-3.5 w-3.5" />
                        Halt
                      </button>
                    )}
                  </td>
                  {/* Ajustar Preço */}
                  <td className="py-2.5 px-2 text-right">
                    <button
                      onClick={() => openAdjustModal(asset)}
                      disabled={!canHalt}
                      title={!canHalt ? 'Sem permissão' : 'Ajustar preço (DB + motor)'}
                      className="min-h-[36px] min-w-[36px] inline-flex items-center gap-1 px-2.5 py-1 text-xs text-[#F0B90B] border border-[rgba(240,185,11,.3)] rounded-lg hover:bg-[rgba(240,185,11,.08)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Ajustar
                    </button>
                  </td>
                  {/* Aliases */}
                  <td className="py-2.5 px-2 text-center">
                    <button
                      onClick={() => setAliasTickerOpen(isAliasOpen ? null : asset.ticker)}
                      className={cn(
                        'min-h-[36px] min-w-[36px] inline-flex items-center gap-1 px-2.5 py-1 text-xs border rounded-lg transition-colors',
                        isAliasOpen
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : 'text-[#929AA5] border-[rgba(240,185,11,.1)] hover:text-[#c5b99a]'
                      )}
                      aria-label={`Gerenciar aliases de ${asset.ticker}`}
                      aria-expanded={isAliasOpen}
                    >
                      <Tag className="h-3.5 w-3.5" />
                      Alias
                    </button>
                  </td>
                </tr>
              )
            })}
            {/* Painel de aliases inline (fora do map principal para evitar problemas de aninhamento) */}
            {aliasTickerOpen && (
              <tr key={`${aliasTickerOpen}-aliases-panel`}>
                <td colSpan={9} className="px-2 pb-3 pt-0">
                  <AliasManagement
                    ticker={aliasTickerOpen}
                    displayName={displayed.find((a) => a.ticker === aliasTickerOpen)?.displayName}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
