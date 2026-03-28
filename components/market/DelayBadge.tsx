'use client'

// ============================================================================
// Foot Stock — DelayBadge
// Indica ao usuário Jogador/Craque que os preços têm atraso.
// Retorna null para plano LENDA (tempo real) ou sem delay.
// ============================================================================

import Link from 'next/link'
import { Clock } from 'lucide-react'
import type { PlanType } from '@/lib/enums'

interface DelayBadgeProps {
  planType: PlanType
  delaySeconds?: number
}

export default function DelayBadge({ planType, delaySeconds }: DelayBadgeProps) {
  const totalSeconds = delaySeconds ?? 0

  // LENDA = tempo real; sem delay = sem badge
  if (planType === 'LENDA' || totalSeconds === 0) return null

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.round((totalSeconds % 3600) / 60)

  const label = hours >= 1
    ? `Dados com ${hours}h de atraso`
    : `Dados com ${minutes} min de atraso`

  return (
    <div
      role="status"
      data-testid="delay-badge"
      aria-label={`Atenção: ${label}. Clique para fazer upgrade.`}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-yellow-900/20 border border-yellow-600/50 text-yellow-400 text-xs"
    >
      <Clock size={14} className="flex-shrink-0" aria-hidden="true" />
      <span>{label}</span>
      <Link
        href="/planos"
        data-testid="delay-badge-upgrade-link"
        className="ml-1 underline hover:text-yellow-300 focus:outline-none focus:ring-1 focus:ring-yellow-400 rounded transition-colors"
        title="Faça upgrade para Lenda para cotações em tempo real"
      >
        Fazer upgrade
      </Link>
    </div>
  )
}
