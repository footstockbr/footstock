'use client'

// ============================================================================
// Foot Stock — NoticiasClient
// Orquestra TickerFilter + NewsFeed na pagina de noticias.
// Rastreabilidade: module-17-rss-noticias / TASK-5
// ============================================================================

import { useState } from 'react'
import TickerFilter from './TickerFilter'
import NewsFeed from './NewsFeed'

export default function NoticiasClient() {
  const [selectedTicker, setSelectedTicker] = useState<string | undefined>()

  return (
    <div className="flex flex-col gap-0 pb-24">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-lg font-semibold text-white">Noticias</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Noticias de futebol com impacto nos precos dos ativos
        </p>
      </div>

      {/* Filtro por ticker */}
      <TickerFilter selectedTicker={selectedTicker} onSelect={setSelectedTicker} />

      {/* Feed de noticias */}
      <NewsFeed selectedTicker={selectedTicker} />
    </div>
  )
}
