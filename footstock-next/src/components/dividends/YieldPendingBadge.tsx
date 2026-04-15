'use client'

import { Zap } from 'lucide-react'
import { formatFS } from '@/lib/utils/format'

interface Props {
  /** Total de yield pendente em FS$ */
  totalPending: number
  /** Exibe tooltip ao hover */
  showTooltip?: boolean
}

/**
 * Badge exibido em posições de usuário JOGADOR para indicar yield acumulado não realizado.
 * Visível apenas quando totalPending > 0.
 */
export function YieldPendingBadge({ totalPending, showTooltip = false }: Props) {
  if (totalPending <= 0) return null

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border"
      style={{
        background: 'rgba(102,126,234,.12)',
        color: '#667EEA',
        borderColor: 'rgba(102,126,234,.25)',
      }}
      title={showTooltip ? `Yield pendente: ${formatFS(totalPending)} — venda para realizar` : undefined}
      data-testid="yield-pending-badge"
    >
      <Zap className="h-2.5 w-2.5" />
      Yield pendente: {formatFS(totalPending)}
    </span>
  )
}
