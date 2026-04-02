'use client'

// ============================================================================
// Foot Stock — GlossaryCategories
// Accordion por categoria com navegação acessível
// Fonte: module-18/TASK-3/ST004
// ============================================================================

import { useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { TermCard } from '@/components/glossary/TermCard'
import { GLOSSARY_TERMS, type GlossaryTerm } from '@/lib/data/glossary'
import { GLOSSARY_CATEGORY, type GlossaryCategory } from '@/lib/enums'

const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  'indicadores-tecnicos': 'Indicadores Técnicos',
  'valuation-e-fundamentos': 'Valuation e Fundamentos',
  'tipos-de-ordem': 'Tipos de Ordem',
  'carteira-e-rentabilidade': 'Carteira e Rentabilidade',
  'sentimento-e-analise': 'Sentimento e Análise',
  'mercado-e-pregao': 'Mercado e Pregão',
  'divisoes-e-clubes': 'Divisões e Clubes',
  'planos-e-funcionalidades': 'Planos e Funcionalidades',
}

const CATEGORY_ORDER: GlossaryCategory[] = [
  GLOSSARY_CATEGORY.INDICADORES_TECNICOS,
  GLOSSARY_CATEGORY.TIPOS_DE_ORDEM,
  GLOSSARY_CATEGORY.MERCADO_PREGAO,
  GLOSSARY_CATEGORY.VALUATION_FUNDAMENTOS,
  GLOSSARY_CATEGORY.SENTIMENTO_ANALISE,
  GLOSSARY_CATEGORY.CARTEIRA_RENTABILIDADE,
  GLOSSARY_CATEGORY.DIVISOES_CLUBES,
  GLOSSARY_CATEGORY.PLANOS_FUNCIONALIDADES,
]

interface GlossaryCategoriesProps {
  filteredTerms?: GlossaryTerm[] | null
}

export function GlossaryCategories({ filteredTerms }: GlossaryCategoriesProps) {
  const [openCategories, setOpenCategories] = useState<Set<GlossaryCategory>>(
    new Set([GLOSSARY_CATEGORY.INDICADORES_TECNICOS])
  )
  const [openTerms, setOpenTerms] = useState<Set<string>>(new Set())

  function toggleCategory(cat: GlossaryCategory) {
    setOpenCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  function toggleTerm(slug: string) {
    setOpenTerms(prev => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function scrollToTerm(slug: string) {
    const el = document.getElementById(`term-def-${slug}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })

    // Abrir categoria e termo relacionado
    const term = GLOSSARY_TERMS.find(t => t.slug === slug)
    if (term) {
      setOpenCategories(prev => new Set([...prev, term.category]))
      setOpenTerms(prev => new Set([...prev, slug]))
    }
  }

  // Modo busca: mostrar termos filtrados sem accordion de categoria
  if (filteredTerms !== null && filteredTerms !== undefined) {
    if (filteredTerms.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-text-secondary text-sm">Nenhum termo encontrado.</p>
          <p className="text-text-muted text-xs">Tente buscar por outra palavra-chave.</p>
        </div>
      )
    }

    return (
      <div className="bg-bg-elevated border border-border-default rounded-xl overflow-hidden">
        <p className="text-xs text-text-muted px-4 py-2 border-b border-border-default">
          {filteredTerms.length} resultado{filteredTerms.length !== 1 ? 's' : ''}
        </p>
        <div className="px-4">
          {filteredTerms.map(term => (
            <TermCard
              key={term.slug}
              term={term}
              isOpen={openTerms.has(term.slug)}
              onToggle={toggleTerm}
              onRelatedClick={scrollToTerm}
            />
          ))}
        </div>
      </div>
    )
  }

  // Modo normal: accordion por categoria
  return (
    <div className="space-y-3" role="list" aria-label="Categorias do glossário">
      {CATEGORY_ORDER.map(cat => {
        const terms = GLOSSARY_TERMS.filter(t => t.category === cat)
        const isOpen = openCategories.has(cat)

        return (
          <div
            key={cat}
            role="listitem"
            className="bg-bg-elevated border border-border-default rounded-xl overflow-hidden"
          >
            {/* Header da categoria */}
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`cat-${cat}`}
              onClick={() => toggleCategory(cat)}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-bg-surface transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-text-primary">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="text-xs text-text-muted bg-bg-surface px-2 py-0.5 rounded-full">
                  {terms.length}
                </span>
              </div>
              <svg
                className={cn(
                  'w-4 h-4 text-text-muted transition-transform flex-shrink-0',
                  isOpen && 'rotate-180'
                )}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Termos da categoria */}
            {isOpen && (
              <div id={`cat-${cat}`} className="px-4 pb-2">
                {terms.map(term => (
                  <TermCard
                    key={term.slug}
                    term={term}
                    isOpen={openTerms.has(term.slug)}
                    onToggle={toggleTerm}
                    onRelatedClick={scrollToTerm}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
