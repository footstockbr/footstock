export default function AssetDetailLoading() {
  return (
    <div
      className="flex flex-col gap-4 p-4"
      aria-busy="true"
      aria-label="Carregando dados do ativo..."
    >
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#2B3139] animate-pulse" />
        <div className="flex flex-col gap-1">
          <div className="w-32 h-4 bg-[#2B3139] animate-pulse rounded" />
          <div className="w-16 h-3 bg-[#2B3139] animate-pulse rounded" />
        </div>
        <div className="ml-auto w-24 h-8 bg-[#2B3139] animate-pulse rounded" />
      </div>
      {/* Chart skeleton */}
      <div className="w-full h-[300px] bg-[#1E2329] animate-pulse rounded-lg" />
      {/* OFI skeleton */}
      <div className="w-full h-[80px] bg-[#1E2329] animate-pulse rounded-lg" />
      {/* Tabs skeleton */}
      <div className="flex gap-2">
        <div className="w-20 h-8 bg-[#2B3139] animate-pulse rounded" />
        <div className="w-20 h-8 bg-[#2B3139] animate-pulse rounded" />
        <div className="w-28 h-8 bg-[#2B3139] animate-pulse rounded" />
      </div>
    </div>
  )
}
