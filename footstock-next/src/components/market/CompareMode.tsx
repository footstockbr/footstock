'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { useAnalytics } from '@/hooks/useAnalytics'

interface AssetOption {
  ticker: string
  displayName: string
  colors: { primary: string }
}

interface CompareModeProps {
  baseTicker: string
  allAssets: AssetOption[]
  canCompare: boolean
  onCompare: (tickers: string[]) => void
  onClose: () => void
}

export function CompareMode({
  baseTicker,
  allAssets,
  canCompare,
  onCompare,
  onClose,
}: CompareModeProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const router = useRouter()
  const { track } = useAnalytics()

  if (!canCompare) {
    return (
      <div data-testid="compare-mode" className="flex flex-col items-center justify-center gap-3 p-6">
        <p className="text-sm text-[#929AA5] text-center">
          A comparação de ativos está disponível a partir do plano Craque.
        </p>
        <button
          onClick={() => {
            onClose()
            router.push('/planos')
          }}
          className="text-xs text-[#F0B90B] underline"
        >
          Ver planos
        </button>
      </div>
    )
  }

  const filtered = allAssets.filter(
    (a) =>
      a.ticker !== baseTicker &&
      (a.displayName.toLowerCase().includes(search.toLowerCase()) ||
        a.ticker.toLowerCase().includes(search.toLowerCase()))
  )

  function toggle(ticker: string) {
    setSelected((prev) =>
      prev.includes(ticker)
        ? prev.filter((t) => t !== ticker)
        : prev.length < 3
        ? [...prev, ticker]
        : prev
    )
  }

  function handleConfirm() {
    if (selected.length > 0) {
      onCompare([baseTicker, ...selected])

      // EVT-018: asset_comparison_used — rastreia uso do modo de comparacao
      track('asset_comparison_used', {
        primary_ticker: baseTicker,
        comparison_count: (selected.length + 1) as 2 | 3 | 4,
        plan: 'JOGADOR' as const,
      })
    }
    onClose()
  }

  return (
    <div data-testid="compare-mode" className="flex flex-col gap-3 p-4">
      <h2 className="text-base font-bold text-[#EAECEF]">Comparar com outros clubes</h2>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#929AA5]" />
        <input
          type="text"
          placeholder="Buscar clube..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="compare-search"
          aria-label="Buscar clube para comparação"
          className="w-full bg-[#1E2329] border border-[#2B3139] rounded-lg pl-8 pr-3 py-2 text-sm text-[#EAECEF] placeholder:text-[#707A8A] focus:outline-none focus:border-[#F0B90B]"
        />
      </div>

      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((t) => {
            const asset = allAssets.find((a) => a.ticker === t)
            return (
              <span
                key={t}
                className="flex items-center gap-1 bg-[#2B3139] text-[#EAECEF] text-xs px-2 py-1 rounded-full"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: asset?.colors.primary ?? '#F0B90B' }}
                />
                {t}
                <button onClick={() => toggle(t)} className="text-[#929AA5] hover:text-[#F6465D]">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Asset list */}
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtered.length === 0 && (
          <p className="text-xs text-[#929AA5] text-center py-4">Nenhum ativo encontrado.</p>
        )}
        {filtered.map((a) => {
          const isSelected = selected.includes(a.ticker)
          const isDisabled = !isSelected && selected.length >= 3
          return (
            <label
              key={a.ticker}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${
                isDisabled
                  ? 'opacity-40 cursor-not-allowed'
                  : 'hover:bg-[#1a1610]'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => !isDisabled && toggle(a.ticker)}
                className="accent-[#F0B90B]"
              />
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: a.colors.primary }}
              />
              <span className="text-sm text-[#EAECEF] truncate">{a.displayName}</span>
              <span className="text-xs text-[#929AA5] ml-auto font-mono">{a.ticker}</span>
            </label>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-1">
        <button
          onClick={onClose}
          data-testid="compare-cancel"
          className="flex-1 py-2 rounded-lg border border-[#2B3139] text-sm text-[#929AA5] hover:text-[#EAECEF]"
        >
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={selected.length === 0}
          data-testid="compare-confirm"
          className="flex-1 py-2 rounded-lg bg-[#F0B90B] text-[#0B0E11] text-sm font-semibold disabled:opacity-40"
        >
          Comparar ({selected.length})
        </button>
      </div>
    </div>
  )
}
