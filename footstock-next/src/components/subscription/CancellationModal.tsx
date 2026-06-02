'use client'

// ============================================================================
// CancellationModal — modal de cancelamento em 3 etapas
// Etapa 1: "Tem certeza?" — consequencias listadas
// Etapa 2: Confirmação — checkbox de ciência + confirmação explícita
// Etapa 3: Cancelamento confirmado — próximos passos
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  isOpen: boolean
  onClose: () => void
  planType: string
  isEligibleForRefund?: boolean
}

type Step = 'confirm' | 'acknowledge' | 'done'

const CONSEQUENCES_BY_PLAN: Record<string, string[]> = {
  LENDA: [
    'A renovação automática será cancelada',
    'Você mantém os recursos do plano até o fim do período já pago',
    'Ao final do período, recursos LENDA deixam de ficar disponíveis',
    'Você volta ao plano gratuito Jogador, com saldo FS$ ajustado para FS$2.000',
    'Sua conta e seu histórico continuam ativos',
  ],
  CRAQUE: [
    'A renovação automática será cancelada',
    'Você mantém os recursos do plano até o fim do período já pago',
    'Ao final do período, recursos CRAQUE deixam de ficar disponíveis',
    'Você volta ao plano gratuito Jogador, com saldo FS$ ajustado para FS$2.000',
    'Sua conta e seu histórico continuam ativos',
  ],
  JOGADOR: [],
}

export function CancellationModal({ isOpen, onClose, planType, isEligibleForRefund }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('confirm')
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const [lockInfo, setLockInfo] = useState<{
    cancellationLockExpiresAt?: string
    cancellationEffectiveAt?: string
    cancellationMode?: 'SCHEDULED' | 'REFUND' | null
    forcedLiquidationAt?: string
    isEligibleForRefund?: boolean
  } | null>(null)

  const consequences = CONSEQUENCES_BY_PLAN[planType] ?? []
  const planName = planType === 'LENDA' ? 'Lenda' : planType === 'CRAQUE' ? 'Craque' : 'atual'

  useEffect(() => {
    if (!isOpen) return

    triggerRef.current = document.activeElement as HTMLElement
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    return () => {
      document.body.style.overflow = ''
      triggerRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) {
        handleClose()
        return
      }

      if (e.key !== 'Tab' || !dialogRef.current) return

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (!first || !last) return

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  })

  function handleClose() {
    if (step === 'done') router.refresh()
    setStep('confirm')
    setAcknowledged(false)
    setError(null)
    setLockInfo(null)
    onClose()
  }

  async function handleConfirmCancel() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/subscriptions/me', {
        method: 'DELETE',
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json?.error?.message ?? 'Ocorreu um erro ao processar o cancelamento.')
        return
      }

      setLockInfo({
        cancellationLockExpiresAt: json?.data?.cancellationLockExpiresAt,
        cancellationEffectiveAt: json?.data?.cancellationEffectiveAt,
        cancellationMode: json?.data?.cancellationMode,
        forcedLiquidationAt: json?.data?.forcedLiquidationAt,
        isEligibleForRefund: json?.data?.isEligibleForRefund,
      })
      setStep('done')
    } catch {
      setError('Erro de conexao. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancellation-modal-title"
      aria-describedby="cancellation-modal-description"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) handleClose()
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-xl bg-white shadow-2xl focus:outline-none"
      >
        {/* Etapa 1: Tem certeza? */}
        {step === 'confirm' && (
          <div className="p-6">
            <h2 id="cancellation-modal-title" className="text-lg font-bold text-gray-900 mb-1">
              Cancelar assinatura
            </h2>
            <p id="cancellation-modal-description" className="text-sm text-gray-600 mb-4">
              Ao cancelar, a renovação do plano {planName} será interrompida:
            </p>

            {consequences.length > 0 && (
              <ul className="mb-4 space-y-2">
                {consequences.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">!</span>
                    {c}
                  </li>
                ))}
              </ul>
            )}

            <p className="text-xs text-gray-500 mb-6">
              {isEligibleForRefund
                ? 'Reembolso integral dentro dos 7 dias é uma ação separada. Este fluxo apenas cancela a renovação.'
                : 'Este fluxo cancela a renovação e mantém sua conta ativa. Seu plano continua até o fim do período pago.'}
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('acknowledge')}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Quero cancelar
              </button>
              <button
                onClick={handleClose}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        )}

        {/* Etapa 2: Confirmação */}
        {step === 'acknowledge' && (
          <div className="p-6">
            <h2 id="cancellation-modal-title" className="text-lg font-bold text-gray-900 mb-4">
              Confirmar cancelamento
            </h2>

            <div className="rounded-md bg-amber-50 border border-amber-200 p-4 mb-4">
              <p id="cancellation-modal-description" className="text-sm text-amber-900 font-medium mb-1">O que acontece após o cancelamento:</p>
              <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                <li>Seu plano continua ativo até o fim do período pago</li>
                <li>Não haverá renovação automática</li>
                <li>Ao final, você volta ao plano gratuito Jogador</li>
                <li>Sua conta e seu histórico continuam ativos</li>
                <li>Você pode reverter o cancelamento antes do fim do plano pago</li>
              </ul>
            </div>

            <label className="flex items-start gap-3 cursor-pointer mb-6">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">
                Entendo e estou ciente das consequências do cancelamento descritas acima.
              </span>
            </label>

            {error && (
              <p className="mb-4 text-sm text-red-600 rounded-md bg-red-50 p-3" role="alert">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleConfirmCancel}
                disabled={!acknowledged || loading}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Processando...' : 'Confirmar cancelamento'}
              </button>
              <button
                onClick={() => setStep('confirm')}
                disabled={loading}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        )}

        {/* Etapa 3: Cancelamento confirmado */}
        {step === 'done' && (
          <div className="p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <span className="text-2xl">&#x26A0;&#xFE0F;</span>
            </div>
            <h2 id="cancellation-modal-title" className="text-lg font-bold text-gray-900 mb-2">
              {lockInfo?.cancellationMode === 'REFUND'
                ? 'Plano cancelado com reembolso'
                : 'Cancelamento agendado'}
            </h2>

            {lockInfo?.cancellationMode === 'REFUND' ? (
              <p id="cancellation-modal-description" className="text-sm text-gray-600 mb-6">
                Seu plano foi cancelado dentro do período de arrependimento (CDC Art. 49).
                Você voltou ao plano gratuito Jogador e sua conta continua ativa. O valor retorna em até 7 dias úteis.
              </p>
            ) : (
              <div id="cancellation-modal-description" className="text-sm text-gray-600 mb-6 space-y-2">
                <p>
                  Seu cancelamento foi registrado. Você mantém o plano {planName} até{' '}
                  {lockInfo?.cancellationEffectiveAt
                    ? new Date(lockInfo.cancellationEffectiveAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'o fim do período'}
                  .
                </p>
                <ul className="text-left space-y-1 text-xs text-gray-700 list-disc list-inside">
                  <li>Não haverá renovação automática</li>
                  <li>Depois disso, você volta ao plano gratuito Jogador</li>
                  <li>Sua conta e seu histórico continuam ativos</li>
                  <li>Você pode reverter o cancelamento antes do fim do plano pago</li>
                  {lockInfo?.isEligibleForRefund && (
                    <li>Reembolso integral deve ser solicitado separadamente</li>
                  )}
                </ul>
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
            >
              Entendi
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
