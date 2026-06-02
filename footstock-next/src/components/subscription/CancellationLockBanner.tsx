'use client'

// ============================================================================
// CancellationLockBanner — banner persistente no topo quando status = CANCELLATION_LOCK
// Não pode ser dispensado (sem X de fechar)
// Mostra countdown ate o encerramento agendado e botao de reverter
// ============================================================================

import { CancellationCountdown } from './CancellationCountdown'
import { RevertCancellationButton } from './RevertCancellationButton'

interface Props {
  planType: string
  cancellationLockExpiresAt: string
  forcedLiquidationAt: string | null
}

const PLAN_LABELS: Record<string, string> = {
  CRAQUE: 'Craque',
  LENDA: 'Lenda',
}

export function CancellationLockBanner({ planType, cancellationLockExpiresAt, forcedLiquidationAt }: Props) {
  const now = new Date()
  const forcedLiqDate = forcedLiquidationAt ? new Date(forcedLiquidationAt) : null
  const forcedLiqPending = forcedLiqDate && forcedLiqDate > now
  const planName = PLAN_LABELS[planType] ?? 'pago'

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
            Plano {planName} termina em{' '}
            <CancellationCountdown expiresAt={cancellationLockExpiresAt} />
            {' '}— você volta ao plano gratuito Jogador
          </p>
          {forcedLiqPending && (
            <p className="text-amber-800 text-xs">
              Suas posições restritas (short, alavancadas, OCO) serão encerradas automaticamente em{' '}
              <CancellationCountdown expiresAt={forcedLiquidationAt!} />.{' '}
              Você pode fechá-las antes disso.
            </p>
          )}
          {!forcedLiquidationAt && (
            <p className="text-amber-800 text-xs">
              Seu plano permanece ativo até a data acima. Sua conta e histórico continuam, sem renovação automática.
            </p>
          )}
          {forcedLiquidationAt && !forcedLiqPending && (
            <p className="text-amber-800 text-xs">
              Posições restritas já foram encerradas. No prazo acima, você volta ao plano gratuito Jogador. Sua conta e histórico continuam.
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
