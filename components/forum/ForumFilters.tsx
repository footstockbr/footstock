'use client'

// ============================================================================
// Foot Stock — ForumFilters
// Filtros por ticker e ordenação com scroll horizontal touch-friendly
// Fonte: module-18/TASK-2/ST002
// ============================================================================

import { cn } from '@/lib/utils/cn'
import { TICKERS_40 } from '@/lib/constants/tickers'
import type { ForumSortOrder } from '@/lib/repositories/ForumRepository'

interface ForumFiltersProps {
  selectedTicker?: string
  sort: ForumSortOrder
  onTickerChange: (t?: string) => void
  onSortChange: (s: ForumSortOrder) => void
}

export function ForumFilters({ selectedTicker, sort, onTickerChange, onSortChange }: ForumFiltersProps) {
  return (
    <div className="space-y-2">
      {/* Linha 1: Ordenação */}
      <div
        role="group"
        aria-label="Ordenação dos posts"
        className="flex gap-2"
      >
        {(['recent', 'popular'] as const).map(s => (
          <button
            key={s}
            type="button"
            role="button"
            aria-pressed={sort === s}
            onClick={() => onSortChange(s)}
            className={cn(
              'min-h-[44px] px-4 rounded-full text-sm font-medium transition-colors',
              sort === s
                ? 'bg-accent text-black'
                : 'bg-bg-elevated text-text-secondary border border-border-default hover:border-accent'
            )}
          >
            {s === 'recent' ? 'Recente' : 'Popular'}
          </button>
        ))}
      </div>

      {/* Linha 2: Tickers */}
      <div
        role="group"
        aria-label="Filtrar por ticker"
        className="flex gap-2 overflow-x-auto scrollbar-none pb-1"
      >
        {/* Chip Todos */}
        <button
          type="button"
          aria-pressed={!selectedTicker}
          onClick={() => onTickerChange(undefined)}
          className={cn(
            'min-h-[44px] min-w-[60px] flex-shrink-0 px-3 rounded-full text-xs font-medium transition-colors',
            !selectedTicker
              ? 'bg-[#F0B90B] text-black'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          )}
        >
          Todos
        </button>

        {TICKERS_40.map(t => (
          <button
            key={t}
            type="button"
            aria-pressed={selectedTicker === t}
            onClick={() => onTickerChange(selectedTicker === t ? undefined : t)}
            className={cn(
              'min-h-[44px] min-w-[56px] flex-shrink-0 px-3 rounded-full text-xs font-medium transition-colors',
              selectedTicker === t
                ? 'bg-[#F0B90B] text-black'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
