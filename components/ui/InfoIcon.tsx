'use client'

// ============================================================================
// Foot Stock — InfoIcon
// Ícone de informação com tooltip ao hover/focus.
// Suporta glossarySlug para vincular ao glossário (module-18)
// ============================================================================

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils/cn'
import { getTermBySlug } from '@/lib/data/glossary'
import { Modal } from '@/components/ui/Modal'

export interface InfoIconProps {
  /** Slug do termo no glossário (preferido — busca automaticamente title+definition) */
  glossarySlug?: string
  /** Termo do glossário (fallback manual se glossarySlug não fornecido) */
  term?: string
  /** Definição/explicação (fallback manual se glossarySlug não fornecido) */
  definition?: string
  className?: string
}

/**
 * Ícone de informação com tooltip ao hover/focus.
 * Se glossarySlug for fornecido, busca o termo no glossário e abre Modal.
 * Se apenas term+definition forem fornecidos, exibe tooltip simples.
 */
export function InfoIcon({ glossarySlug, term, definition, className }: InfoIconProps) {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const glossaryTerm = glossarySlug ? getTermBySlug(glossarySlug) : undefined

  const displayTerm = glossaryTerm?.title ?? term ?? ''
  const displayDefinition = glossaryTerm?.definition ?? definition ?? ''

  // Modo glossário: abre modal com definição completa
  if (glossarySlug) {
    const handleGlossaryClick = () => {
      setIsModalOpen(true)
      // Fire-and-forget: registra interação no glossário (Pilar 5)
      fetch('/api/v1/glossary/interact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termSlug: glossarySlug }),
      }).catch(() => {/* falha silenciosa */})
    }

    return (
      <>
        <button
          type="button"
          aria-label={`Glossário: ${displayTerm}`}
          onClick={handleGlossaryClick}
          className={cn(
            'inline-flex text-text-muted hover:text-accent transition-colors focus-visible:outline-none focus-visible:text-accent',
            className
          )}
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

        {mounted &&
          createPortal(
            <Modal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              title={displayTerm}
              size="sm"
            >
              <p className="text-sm text-text-secondary leading-relaxed mb-3">
                {displayDefinition}
              </p>
              {glossaryTerm?.examples && glossaryTerm.examples.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                    Exemplo
                  </p>
                  {glossaryTerm.examples.map((ex, i) => (
                    <p
                      key={i}
                      className="text-xs text-text-secondary italic pl-3 border-l-2 border-accent/30"
                    >
                      {ex}
                    </p>
                  ))}
                </div>
              )}
            </Modal>,
            document.body
          )}
      </>
    )
  }

  // Modo tooltip simples (compatibilidade retroativa com term+definition)
  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={`Glossário: ${displayTerm}`}
        aria-expanded={isTooltipVisible}
        onMouseEnter={() => setIsTooltipVisible(true)}
        onMouseLeave={() => setIsTooltipVisible(false)}
        onFocus={() => setIsTooltipVisible(true)}
        onBlur={() => setIsTooltipVisible(false)}
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

      {isTooltipVisible && (
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
          <span className="font-semibold text-text-primary block mb-0.5">{displayTerm}</span>
          {displayDefinition}
        </div>
      )}
    </span>
  )
}
