// ============================================================================
// Foot Stock — /ligas/[id] loading skeleton
// Mesmas dimensões do conteúdo real para evitar CLS.
// ============================================================================

export default function LigaDetalheLoading() {
  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-8 animate-pulse" aria-hidden="true">
      {/* Header da liga */}
      <div className="flex items-center gap-3 mb-6">
        <div className="skeleton h-8 w-8 rounded-lg" />
        <div className="flex flex-col gap-1.5">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton h-3 w-24 rounded" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {[80, 100, 90].map((w, i) => (
          <div key={i} style={{ width: w }} className="skeleton h-9 rounded-full" />
        ))}
      </div>

      {/* Tabela de ranking */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
