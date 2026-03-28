// ============================================================================
// Foot Stock — AssetCardSkeleton
// Estado de carregamento com mesmas dimensões do AssetCard (88px min-h).
// aria-hidden="true" para evitar anúncio desnecessário por screen readers.
// ============================================================================

export default function AssetCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      data-testid="asset-card-skeleton"
      className="flex flex-col gap-2 p-3 rounded-xl bg-bg-card border border-border-default min-h-[88px]"
    >
      {/* Linha 1: Avatar + Ticker/Nome + Badge */}
      <div className="flex items-center gap-2">
        <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
        <div className="flex flex-col gap-1 flex-1">
          <div className="skeleton h-3 w-14 rounded" />
          <div className="skeleton h-3 w-24 rounded" />
        </div>
        <div className="skeleton h-4 w-16 rounded-full" />
      </div>

      {/* Linha 2: Preço + Variação */}
      <div className="flex items-baseline gap-3">
        <div className="skeleton h-4 w-20 rounded" />
        <div className="skeleton h-3 w-12 rounded" />
      </div>

      {/* Linha 3: Sparkline + OFI */}
      <div className="flex items-end justify-between">
        <div className="skeleton w-[60px] h-[28px] rounded" />
        <div className="skeleton w-16 h-1.5 rounded-full" />
      </div>
    </article>
  )
}
