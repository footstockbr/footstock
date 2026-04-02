'use client'

// ============================================================================
// Foot Stock — TickerFilter
// Barra horizontal scrollavel de chips para filtrar noticias por ticker.
// Rastreabilidade: module-17-rss-noticias / TASK-5
// ============================================================================

import { TICKERS_40 } from '@/lib/constants/tickers'

export interface TickerFilterProps {
  selectedTicker?: string
  onSelect: (ticker?: string) => void
}

export default function TickerFilter({ selectedTicker, onSelect }: TickerFilterProps) {
  const isAllActive = !selectedTicker

  return (
    <div className="sticky top-0 z-10 bg-[#0d1117] py-2 border-b border-[#1a1a2e]">
      <div
        className="overflow-x-auto scrollbar-hide"
        role="listbox"
        aria-label="Filtrar noticias por clube"
      >
        <div className="flex flex-row gap-2 px-4 whitespace-nowrap">
          {/* Chip "Todos" */}
          <button
            type="button"
            role="option"
            aria-selected={isAllActive}
            aria-label="Todos os clubes"
            onClick={() => onSelect(undefined)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full min-w-[52px] text-center cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#F0B90B] outline-none ${
              isAllActive
                ? 'bg-[#F0B90B]/20 border border-[#F0B90B] text-[#F0B90B]'
                : 'bg-[#1E2329] text-slate-400'
            }`}
          >
            Todos
          </button>

          {/* Ticker chips */}
          {TICKERS_40.map((ticker) => {
            const isActive = selectedTicker === ticker
            return (
              <button
                key={ticker}
                type="button"
                role="option"
                aria-selected={isActive}
                aria-label={`Filtrar por ${ticker}`}
                onClick={() => onSelect(ticker)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full min-w-[52px] text-center cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#F0B90B] outline-none ${
                  isActive
                    ? 'bg-[#F0B90B]/20 border border-[#F0B90B] text-[#F0B90B]'
                    : 'bg-[#1E2329] text-slate-400'
                }`}
              >
                {ticker}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
