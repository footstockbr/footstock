'use client'

// ============================================================================
// Foot Stock — TermCard
// Card de definição de um termo do glossário
// Fonte: module-18/TASK-3/ST003
// ============================================================================

import { cn } from '@/lib/utils/cn'
import type { GlossaryTerm } from '@/lib/data/glossary'

interface TermCardProps {
  term: GlossaryTerm
  isOpen?: boolean
  onToggle?: (slug: string) => void
  onRelatedClick?: (slug: string) => void
  className?: string
}

export function TermCard({ term, isOpen = true, onToggle, onRelatedClick, className }: TermCardProps) {
  return (
    <div className={cn('border-b border-border-default last:border-0', className)}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={`term-def-${term.slug}`}
        onClick={() => onToggle?.(term.slug)}
        className="w-full flex items-center justify-between py-3 px-1 min-h-[44px] text-left hover:text-accent transition-colors"
      >
        <span className="text-sm font-medium text-text-primary">{term.title}</span>
        <svg
          className={cn('w-4 h-4 text-text-muted transition-transform flex-shrink-0 ml-2', isOpen && 'rotate-180')}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div
          id={`term-def-${term.slug}`}
          role="region"
          aria-label={`Definição de ${term.title}`}
          className="pb-4 px-1 space-y-3"
        >
          <p className="text-sm text-text-secondary leading-relaxed">{term.definition}</p>

          {term.examples && term.examples.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Exemplo</p>
              <ul className="space-y-1">
                {term.examples.map((ex, i) => (
                  <li key={i} className="text-xs text-text-secondary italic pl-3 border-l-2 border-accent/30">
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {term.relatedTerms && term.relatedTerms.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-text-muted">Ver também:</span>
              {term.relatedTerms.map(slug => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => onRelatedClick?.(slug)}
                  className="text-xs text-accent underline underline-offset-2 hover:text-accent/80 transition-colors"
                >
                  {slug.replace(/-/g, ' ')}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
