// ============================================================================
// Foot Stock — Admin loading skeleton (grupo /admin)
// Exibido durante navegação entre rotas do painel admin.
// ============================================================================

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 animate-pulse" aria-hidden="true">
      {/* Breadcrumb skeleton */}
      <div className="h-5 w-48 rounded bg-zinc-800" />

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="h-3 w-20 rounded bg-zinc-800 mb-3" />
            <div className="h-6 w-16 rounded bg-zinc-700" />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="h-4 w-32 rounded bg-zinc-800 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-4 rounded bg-zinc-800" />
              <div className="h-4 flex-1 rounded bg-zinc-800" />
              <div className="h-4 w-20 rounded bg-zinc-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
