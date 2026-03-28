'use client'

// ============================================================================
// Foot Stock — MarketSearch
// Campo de busca com debounce via useDebounce hook e botão X condicional.
// ============================================================================

import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useDebounce } from '@/hooks/useDebounce'

interface MarketSearchProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  className?: string
}

export default function MarketSearch({ value, onChange, onClear, className }: MarketSearchProps) {
  const [localValue, setLocalValue] = useState(value)
  const debouncedValue = useDebounce(localValue, 300)

  // Sincronizar quando o pai reseta (ex: onClear)
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Emitir valor debounced para o pai
  useEffect(() => {
    if (debouncedValue !== value) {
      onChange(debouncedValue)
    }
  }, [debouncedValue, onChange, value])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setLocalValue('')
      onClear()
    }
  }

  return (
    <div className={cn('relative', className)}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="search"
        data-testid="market-search-input"
        placeholder="Buscar por clube ou ticker..."
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full min-h-[44px] pl-9 pr-8 py-2',
          'bg-bg-elevated border border-border-default rounded-lg',
          'text-sm text-text-primary placeholder:text-text-tertiary',
          'focus:border-violet-500 focus:outline-none transition-colors'
        )}
      />
      {localValue && (
        <button
          type="button"
          aria-label="Limpar busca"
          data-testid="market-search-clear"
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
