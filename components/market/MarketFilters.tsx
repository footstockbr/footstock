'use client'

// ============================================================================
// Foot Stock — MarketFilters
// Filtros de divisão em pills com aria-pressed e toggle.
// ============================================================================

import { cn } from '@/lib/utils/cn'
import { DIVISION, type Division } from '@/lib/enums'
import type { AssetFilters } from '@/types/market'

interface MarketFiltersProps {
  filters: AssetFilters
  onChange: (filters: AssetFilters) => void
  className?: string
}

const divisionOptions: { label: string; value: Division; testId: string }[] = [
  { label: 'Todos', value: undefined as unknown as Division, testId: 'filter-btn-all' },
  { label: 'Série A', value: DIVISION.SERIE_A, testId: 'filter-btn-series-a' },
  { label: 'Série B', value: DIVISION.SERIE_B, testId: 'filter-btn-series-b' },
]

export default function MarketFilters({ filters, onChange, className }: MarketFiltersProps) {
  function handleDivision(value: Division | undefined) {
    // Toggle: clique no mesmo botão ativo → desativa
    const newDivision = filters.division === value ? undefined : value
    onChange({ ...filters, division: newDivision })
  }

  return (
    <div
      role="group"
      aria-label="Filtros de mercado"
      data-testid="market-filters"
      className={cn('flex items-center gap-2 flex-wrap', className)}
    >
      {divisionOptions.map(opt => {
        const isActive = filters.division === opt.value || (opt.value === undefined && !filters.division)

        return (
          <button
            key={opt.testId}
            type="button"
            data-testid={opt.testId}
            aria-pressed={isActive}
            onClick={() => handleDivision(opt.value)}
            className={cn(
              'min-h-[44px] px-4 py-2 rounded-full text-sm font-medium transition-colors border',
              'focus-visible:outline-2 focus-visible:outline-violet-500 focus-visible:outline-offset-2',
              isActive
                ? 'bg-violet-500/20 border-violet-500 text-text-primary'
                : 'bg-transparent border-border-default text-text-secondary hover:border-border-active'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
