// ============================================================================
// Foot Stock — TickerSelector (module-21/TASK-3/ST003)
// Autocomplete dos 40 tickers com debounce 300ms e acessibilidade ARIA
// ============================================================================

'use client'

import { useState, useRef, useId } from 'react'
import { Search } from 'lucide-react'
import { CLUBS } from '@/lib/constants/clubs'
import { getClubDisplayName } from '@/lib/constants/clubs'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils/cn'

interface TickerSelectorProps {
  value?: string
  onChange: (ticker: string) => void
}

/**
 * Input de busca com dropdown de autocomplete para os 40 tickers cadastrados.
 * Acessível: role="combobox", aria-expanded, aria-autocomplete, role="option".
 */
export function TickerSelector({ value, onChange }: TickerSelectorProps) {
  const [query, setQuery] = useState(value ?? '')
  const [isOpen, setIsOpen] = useState(false)
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const debouncedQuery = useDebounce(query, 300)

  const filtered = CLUBS.filter(club => {
    const q = debouncedQuery.toUpperCase()
    const displayName = getClubDisplayName(club.ticker, club.name)
    return (
      club.ticker.includes(q) ||
      club.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      displayName.toLowerCase().includes(debouncedQuery.toLowerCase())
    )
  })

  function handleSelect(ticker: string) {
    setQuery(ticker)
    setIsOpen(false)
    onChange(ticker)
    inputRef.current?.blur()
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setIsOpen(true)
  }

  function handleBlur() {
    // Delay para permitir click no dropdown antes de fechar
    setTimeout(() => setIsOpen(false), 150)
  }

  return (
    <div className="relative w-full">
      {/* Input */}
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-label="Pesquisar clube"
          placeholder="Pesquisar clube (ex: URU3, POR4...)"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onBlur={handleBlur}
          className={cn(
            'w-full rounded-xl border border-[#1e2a3a] bg-[#0f1923] py-3 pl-10 pr-4',
            'text-sm text-slate-100 placeholder-slate-500',
            'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50',
            'transition-colors'
          )}
        />
      </div>

      {/* Dropdown */}
      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Clubes disponíveis"
          className={cn(
            'absolute z-50 mt-1 w-full overflow-hidden rounded-xl',
            'border border-[#1e2a3a] bg-[#0f1923] shadow-2xl',
            'max-h-60 overflow-y-auto'
          )}
        >
          {filtered.length === 0 ? (
            <li
              role="option"
              aria-selected={false}
              className="px-4 py-3 text-sm text-slate-500"
            >
              Nenhum clube encontrado
            </li>
          ) : (
            filtered.map(club => (
              <li
                key={club.ticker}
                role="option"
                aria-selected={value === club.ticker}
                onMouseDown={() => handleSelect(club.ticker)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-4 py-3',
                  'text-sm transition-colors hover:bg-[#1a2a3a]',
                  value === club.ticker && 'bg-[#1a2a3a]'
                )}
              >
                {/* Avatar do clube (placeholder) */}
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1e2a3a] text-[10px] font-bold text-slate-300"
                  aria-hidden="true"
                >
                  {club.ticker.slice(0, 2)}
                </div>
                <span className="font-semibold text-slate-100">{club.ticker}</span>
                <span className="text-slate-400">
                  {getClubDisplayName(club.ticker, club.name)}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
