// ============================================================================
// Foot Stock — /mercado loading.tsx
// Skeleton exibido durante carregamento da página (Next.js Suspense).
// Mesmas dimensões do conteúdo real para evitar CLS.
// ============================================================================

import AssetCardSkeleton from '@/components/market/AssetCardSkeleton'

export default function MercadoLoading() {
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-24">
      {/* Skeleton da busca */}
      <div className="skeleton h-11 w-full rounded-lg" aria-hidden="true" />

      {/* Skeleton dos filtros */}
      <div className="flex gap-2" aria-hidden="true">
        {[72, 72, 72].map((w, i) => (
          <div key={i} style={{ width: w }} className="skeleton h-11 rounded-full" />
        ))}
      </div>

      {/* 8 skeletons de cards */}
      {Array.from({ length: 8 }).map((_, i) => (
        <AssetCardSkeleton key={i} />
      ))}
    </div>
  )
}
