'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Info, X, BookOpen, ExternalLink } from 'lucide-react'
import { getTermBySlug, FIELD_TERM_MAP, type GlossaryTerm } from '@/lib/data/glossary'
import { useAnalytics } from '@/hooks/useAnalytics'

// ─── Props ────────────────────────────────────────────────────────────────────

interface GlossaryInfoIconProps {
  /** Chave do FIELD_TERM_MAP (ex: 'pnl', 'stop-loss', 'rsi') */
  fieldKey: string
  /** Tamanho do ícone (default: 14px) */
  size?: number
  /** Classe CSS adicional */
  className?: string
}

// ─── Tracking helper ──────────────────────────────────────────────────────────

async function trackInteraction(termSlug: string): Promise<void> {
  try {
    await fetch('/api/v1/glossary/interact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termSlug }),
    })
  } catch {
    // fire-and-forget
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GlossaryInfoIcon({
  fieldKey,
  size = 14,
  className = '',
}: GlossaryInfoIconProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [term, setTerm] = useState<GlossaryTerm | null>(null)
  const [relatedTerms, setRelatedTerms] = useState<GlossaryTerm[]>([])
  const modalRef = useRef<HTMLDivElement>(null)
  const { track } = useAnalytics()

  const slug = FIELD_TERM_MAP[fieldKey]

  const handleOpen = useCallback(() => {
    if (!slug) return

    const found = getTermBySlug(slug)
    if (!found) return

    setTerm(found)

    // Resolver termos relacionados
    if (found.relatedTerms?.length) {
      const related = found.relatedTerms
        .map((rs) => getTermBySlug(rs))
        .filter((t): t is GlossaryTerm => t !== undefined)
      setRelatedTerms(related)
    } else {
      setRelatedTerms([])
    }

    setIsOpen(true)
    trackInteraction(slug)

    // EVT-030: glossary_term_viewed — rastreia abertura de termo via info icon
    track('glossary_term_viewed', {
      term_id: found.slug,
      category: found.category,
      accessed_via: 'info_icon',
      plan: 'JOGADOR' as const,
    })
  }, [slug, track])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  // Navegar para termo relacionado dentro do modal
  const navigateToTerm = useCallback((relatedSlug: string) => {
    const found = getTermBySlug(relatedSlug)
    if (!found) return

    setTerm(found)
    if (found.relatedTerms?.length) {
      const related = found.relatedTerms
        .map((rs) => getTermBySlug(rs))
        .filter((t): t is GlossaryTerm => t !== undefined)
      setRelatedTerms(related)
    } else {
      setRelatedTerms([])
    }
    trackInteraction(relatedSlug)
  }, [])

  // Fechar com Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, handleClose])

  // Focus trap
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen, term])

  if (!slug) return null

  return (
    <>
      {/* Trigger icon */}
      <button
        type="button"
        onClick={handleOpen}
        className={`inline-flex items-center cursor-help text-[#707A8A] hover:text-[#F0B90B] transition-colors ${className}`}
        aria-label="Ver definicao no glossario"
      >
        <Info style={{ width: size, height: size }} />
      </button>

      {/* Modal overlay */}
      {isOpen && term && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={`Glossario: ${term.title}`}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleClose}
          />

          {/* Modal */}
          <div
            ref={modalRef}
            tabIndex={-1}
            className="relative w-full sm:max-w-md max-h-[80vh] overflow-y-auto bg-[#1E2329] border border-[rgba(240,185,11,.25)] rounded-t-2xl sm:rounded-2xl p-5 animate-slide-up"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-[#F0B90B] shrink-0" />
                <h3 className="text-base font-bold text-[#EAECEF]">
                  {term.title}
                </h3>
              </div>
              <button
                onClick={handleClose}
                className="text-[#707A8A] hover:text-[#EAECEF] transition-colors"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Definition */}
            <p className="text-sm text-[#929AA5] leading-relaxed mb-4">
              {term.definition}
            </p>

            {/* Examples */}
            {term.examples && term.examples.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-[#EAECEF] uppercase tracking-wider mb-2">
                  Exemplos
                </h4>
                <ul className="space-y-1.5">
                  {term.examples.map((ex, i) => (
                    <li
                      key={i}
                      className="text-sm text-[#929AA5] bg-[#181A20] rounded px-3 py-2 border-l-2 border-[#F0B90B]"
                    >
                      {ex}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Related terms */}
            {relatedTerms.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-[#EAECEF] uppercase tracking-wider mb-2">
                  Termos relacionados
                </h4>
                <div className="flex flex-wrap gap-2">
                  {relatedTerms.map((rt) => (
                    <button
                      key={rt.slug}
                      onClick={() => navigateToTerm(rt.slug)}
                      className="flex items-center gap-1 text-xs text-[#F0B90B] bg-[#F0B90B]/10 hover:bg-[#F0B90B]/20 rounded-full px-3 py-1 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {rt.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
