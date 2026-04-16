'use client'

// ============================================================================
// CancellationLockBanner — banner persistente no topo quando status = CANCELLATION_LOCK
// Não pode ser dispensado (sem X de fechar)
// Mostra countdown até expiração T+7d e botão de reverter
// ============================================================================

import { CancellationCountdown } from './CancellationCountdown'
import { RevertCancellationButton } from './RevertCancellationButton'

interface Props {
  cancellationLockExpiresAt: string   // ISO string UTC — T+7d
  forcedLiquidationAt: string | null  // ISO string UTC — T+48h (quando posições restritas serão liquidadas)
}

export function CancellationLockBanner({ cancellationLockExpiresAt, forcedLiquidationAt }: Props) {
  const now = new Date()
  const forcedLiqDate = forcedLiquidationAt ? new Date(forcedLiquidationAt) : null
  const forcedLiqPending = forcedLiqDate && forcedLiqDate > now

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="w-full bg-amber-50 border-b-2 border-amber-400 px-4 py-3"
    >
      <div className="mx-auto max-w-7xl flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Informações de status */}
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-amber-900 text-sm leading-tight">
            Cancelamento em andamento — conta encerra em{' '}
            <CancellationCountdown expiresAt={cancellationLockExpiresAt} />
          </p>
          {forcedLiqPending && (
            <p className="text-amber-800 text-xs">
              Suas posições restritas (short, alavancadas, OCO) serão encerradas automaticamente em{' '}
              <CancellationCountdown expiresAt={forcedLiquidationAt!} />.{' '}
              Você pode fechá-las antes disso.
            </p>
          )}
          {!forcedLiqPending && (
            <p className="text-amber-800 text-xs">
              Posições restritas já foram encerradas. Sua conta será finalizada no prazo acima.
            </p>
          )}
        </div>

        {/* Acao */}
        <div className="flex-shrink-0">
          <RevertCancellationButton className="sm:text-right" />
        </div>
      </div>
    </div>
  )
}
