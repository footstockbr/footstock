// ============================================================================
// Foot Stock — Portal do Afiliado loading skeleton
// ============================================================================

export default function AffiliateLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-hidden="true">
      {/* Header do portal */}
      <div className="h-6 w-48 rounded bg-white/10" />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="h-3 w-20 rounded bg-white/10 mb-3" />
            <div className="h-6 w-16 rounded bg-white/15" />
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="h-4 w-32 rounded bg-white/10 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-8 rounded bg-white/10" />
              <div className="h-4 flex-1 rounded bg-white/10" />
              <div className="h-4 w-24 rounded bg-white/10" />
              <div className="h-4 w-16 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
