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
      aria-label="Mercado em manutenção — ordens suspensas temporariamente"
      className="sticky top-14 z-40 w-full px-4 py-2"
      style={{ backgroundColor: '#f97316' }}
    >
      <div className="max-w-screen-xl mx-auto flex items-center gap-2">
        <AlertTriangle
          className="h-4 w-4 text-white shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <span className="text-sm font-medium text-white block sm:inline">
            Mercado em manutenção — ordens suspensas temporariamente
          </span>
          <span className="text-xs text-white/80 hidden sm:inline sm:ml-1">
            As cotações exibidas podem estar desatualizadas.
          </span>
        </div>
      </div>
    </div>
  )
}
