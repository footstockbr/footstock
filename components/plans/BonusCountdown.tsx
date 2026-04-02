'use client'

// ============================================================================
// Foot Stock — BonusCountdown: contador regressivo do bônus FS$ T+7
// Sem setInterval — recalcula apenas em re-render (estável, sem memory leak)
// ============================================================================

import { formatDate } from '@/lib/utils/formatDate'

interface BonusCountdownProps {
  bonusAmount: number
  scheduledAt: string
  creditedAt?: string | null
}

export function BonusCountdown({ bonusAmount, scheduledAt, creditedAt }: BonusCountdownProps) {
  const daysRemaining = Math.ceil(
    (new Date(scheduledAt).getTime() - Date.now()) / 86_400_000
  )

  const formattedAmount = bonusAmount.toLocaleString('pt-BR')

  return (
    <div
      role="status"
      aria-label="Status do bônus FS$"
      className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3 flex items-center gap-2"
    >
      <span className="text-base shrink-0" aria-hidden="true">🪙</span>
      <p className="text-sm text-yellow-300">
        {creditedAt != null ? (
          <>
            Bônus de{' '}
            <span className="font-semibold">FS${formattedAmount}</span> creditado em{' '}
            {formatDate(creditedAt)}
          </>
        ) : daysRemaining > 0 ? (
          <>
            Seu bônus de{' '}
            <span className="font-semibold">FS${formattedAmount}</span> será creditado em{' '}
            {daysRemaining} dia(s)
          </>
        ) : (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin"
              aria-hidden="true"
            />
            Processando crédito do bônus...
          </span>
        )}
      </p>
    </div>
  )
}
