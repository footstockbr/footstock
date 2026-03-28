'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'

export interface InfoIconProps {
  /** Termo do glossario */
  term: string
  /** Definicao/explicacao */
  definition: string
  className?: string
}

/**
 * Icone de informacao com tooltip ao hover/focus.
 * Usado para termos do glossario financeiro.
 */
export function InfoIcon({ term, definition, className }: InfoIconProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={`Glossario: ${term}`}
        aria-expanded={isVisible}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        className="text-text-muted hover:text-accent transition-colors focus-visible:outline-none focus-visible:text-accent"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isVisible && (
        <div
          role="tooltip"
          className={cn(
            'absolute bottom-6 left-1/2 -translate-x-1/2',
            'bg-bg-elevated border border-border-default rounded-lg',
            'px-3 py-2 shadow-lg z-tooltip',
            'w-48 text-xs text-text-secondary',
            'pointer-events-none'
          )}
        >
          <span className="font-semibold text-text-primary block mb-0.5">{term}</span>
          {definition}
        </div>
      )}
    </span>
  )
}
