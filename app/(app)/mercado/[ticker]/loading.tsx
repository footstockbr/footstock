// ============================================================================
// Foot Stock — /mercado/[ticker]/loading.tsx
// Skeleton da página de detalhe enquanto o server component carrega.
// ============================================================================

import { AppLayout } from '@/components/layout'
import { Skeleton } from '@/components/ui/Skeleton'

export default function MercadoDetalheLoading() {
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-24 lg:pb-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Conteúdo principal */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {/* Header skeleton */}
            <div className="flex items-center gap-3 pb-4 border-b border-[#2B3139]">
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="w-24 h-5 rounded" />
                <Skeleton className="w-40 h-3.5 rounded" />
              </div>
              <div className="flex flex-col gap-2 items-end ml-auto">
                <Skeleton className="w-28 h-7 rounded" />
                <Skeleton className="w-20 h-4 rounded" />
              </div>
            </div>

            {/* Tabs skeleton */}
            <div className="flex gap-0 border-b border-[#2B3139]">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="w-20 h-10 rounded-none mx-1" />
              ))}
            </div>

            {/* Period buttons skeleton */}
            <div className="flex justify-between items-center">
              <div className="flex gap-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="w-10 h-8 rounded-md" />
                ))}
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="w-12 h-8 rounded-md" />
                ))}
              </div>
            </div>

            {/* Chart skeleton */}
            <Skeleton className="w-full rounded-xl" style={{ minHeight: 380 }} />

            {/* Gauge skeleton */}
            <div className="flex justify-center pt-2">
              <Skeleton className="w-48 h-28 rounded-xl" />
            </div>
          </div>

          {/* Sidebar skeleton */}
          <aside className="w-full lg:w-64 shrink-0">
            <Skeleton className="w-full h-40 rounded-xl" />
          </aside>
        </div>
      </div>
    </AppLayout>
  )
}
