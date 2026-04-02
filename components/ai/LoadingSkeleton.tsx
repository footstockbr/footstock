// ============================================================================
// Foot Stock — LoadingSkeleton (module-21/TASK-3/ST007)
// Skeleton autônomo para o AIAnalysisCard durante análise (5-15s de loading)
// Altura ~300px alinhada com o card preenchido para evitar layout shift
// ============================================================================

import { Skeleton } from '@/components/ui/Skeleton'

export function LoadingSkeleton() {
  return (
    <div
      role="status"
      aria-label="Carregando análise de IA"
      className="w-full space-y-4 rounded-xl border border-[#1e2a3a] bg-[#0f1923] p-5"
      style={{ minHeight: 300 }}
    >
      {/* Header: badge placeholder + título */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      {/* Resumo: 3 linhas */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="h-4 w-[75%]" />
      </div>

      {/* Pontos positivos / negativos em grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[85%]" />
          <Skeleton className="h-3 w-[70%]" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[85%]" />
          <Skeleton className="h-3 w-[70%]" />
        </div>
      </div>

      {/* Gauge de sentimento */}
      <Skeleton className="h-4 w-full rounded-full" />

      {/* Footer: badges */}
      <div className="flex gap-2">
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  )
}
