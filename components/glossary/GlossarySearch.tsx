'use client'

// ============================================================================
// Foot Stock — GlossarySearch
// Busca full-text com useDebounce 300ms (array em memória, < 50ms)
// Fonte: module-18/TASK-3/ST002
// ============================================================================

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils/cn'
import { useDebounce } from '@/hooks/useDebounce'
import { searchTerms } from '@/lib/data/glossary'
import type { GlossaryTerm } from '@/lib/data/glossary'

interface GlossarySearchProps {
  onResultsChange: (results: GlossaryTerm[] | null) => void
}

export function GlossarySearch({ onResultsChange }: GlossarySearchProps) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)

  // Executar busca quando debounced query muda
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      onResultsChange(null) // null = mostrar todas as categorias
      return
    }
    const results = searchTerms(debouncedQuery)
    onResultsChange(results)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery])

  const handleChange = (value: string) => {
    setQuery(value)
    if (!value.trim()) {
      onResultsChange(null)
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={e => handleChange(e.target.value)}
          placeholder="Buscar termos... (ex: short, RSI, suporte)"
          aria-label="Buscar termos do glossário"
          className={cn(
            'w-full pl-9 pr-4 py-3 bg-bg-elevated border border-border-default rounded-xl',
            'text-sm text-text-primary placeholder:text-text-muted',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
            'transition-all'
          )}
        />
        {query && (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => handleChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
          >
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
