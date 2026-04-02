'use client'

// ============================================================================
// Foot Stock — GlossarioClient
// Página do glossário com busca full-text e accordion por categoria
// Fonte: module-18/TASK-3/ST005
// ============================================================================

import { useState } from 'react'
import { AppHeader } from '@/components/layout'
import { GlossarySearch } from '@/components/glossary/GlossarySearch'
import { GlossaryCategories } from '@/components/glossary/GlossaryCategories'
import { GLOSSARY_TERMS } from '@/lib/data/glossary'
import type { GlossaryTerm } from '@/lib/data/glossary'

export default function GlossarioClient() {
  const [searchResults, setSearchResults] = useState<GlossaryTerm[] | null>(null)

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <AppHeader />

      {/* Estatística */}
      <div className="px-4">
        <p className="text-xs text-text-muted">
          {GLOSSARY_TERMS.length} termos em 8 categorias
        </p>
      </div>

      {/* Busca */}
      <div className="px-4">
        <GlossarySearch onResultsChange={setSearchResults} />
      </div>

      {/* Categorias / Resultados */}
      <div className="px-4">
        <GlossaryCategories filteredTerms={searchResults} />
      </div>
    </div>
  )
}
