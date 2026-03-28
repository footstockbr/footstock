'use client'

// ============================================================================
// Foot Stock — MotorOfflineBanner
// Banner vermelho exibido quando o motor Railway está offline.
// Sticky no topo, abaixo do AppHeader, z-index 40.
// ============================================================================

import { AlertTriangle } from 'lucide-react'
import { useMotorStatusContext } from '@/contexts/motor-status-context'

export function MotorOfflineBanner() {
  const { isOffline } = useMotorStatusContext()

  if (!isOffline) return null

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-label="Motor offline — modo somente leitura"
      className="sticky top-14 z-40 w-full bg-red-900/20 border-b border-red-500/50 px-4 py-2"
    >
      <div className="max-w-screen-xl mx-auto flex items-center gap-2">
        <AlertTriangle
          className="h-4 w-4 text-red-400 shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <span className="text-sm font-medium text-red-300 block sm:inline">
            Mercado em manutenção — modo somente leitura
          </span>
          <span className="text-xs text-red-400/80 hidden sm:inline sm:ml-1">
            As cotações exibidas podem estar desatualizadas. Novas ordens estão temporariamente desabilitadas.
          </span>
        </div>
      </div>
    </div>
  )
}
