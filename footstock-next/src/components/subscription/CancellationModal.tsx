'use client'

// ============================================================================
// CancellationModal — modal de cancelamento em 3 etapas
// Etapa 1: "Tem certeza?" — consequencias listadas
// Etapa 2: Confirmação — checkbox de ciência + confirmação explícita
// Etapa 3: Cancelamento confirmado — próximos passos
// ============================================================================

import { useState } from 'react'
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
    'Ao final do período, recursos LENDA serão encerrados',
    'Seu saldo FS$ será ajustado para FS$2.000 no encerramento',
  ],
  CRAQUE: [
    'A renovação automática será cancelada',
    'Você mantém os recursos do plano até o fim do período já pago',
    'Ao final do período, recursos CRAQUE serão encerrados',
    'Seu saldo FS$ será ajustado para FS$2.000 no encerramento',
  ],
  JOGADOR: [],
}

export function CancellationModal({ isOpen, onClose, planType, isEligibleForRefund }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('confirm')
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockInfo, setLockInfo] = useState<{
    cancellationLockExpiresAt?: string
    cancellationEffectiveAt?: string
    cancellationMode?: 'SCHEDULED' | 'REFUND' | null
    forcedLiquidationAt?: string
    isEligibleForRefund?: boolean
  } | null>(null)

  const consequences = CONSEQUENCES_BY_PLAN[planType] ?? []

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
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Etapa 1: Tem certeza? */}
        {step === 'confirm' && (
          <div className="p-6">
            <h2 id="cancellation-modal-title" className="text-lg font-bold text-gray-900 mb-1">
              Cancelar assinatura
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Ao cancelar, a renovação será interrompida:
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
                : 'Este fluxo cancela a renovação e mantém o plano até o fim do período pago.'}
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
              <p className="text-sm text-amber-900 font-medium mb-1">O que acontece após o cancelamento:</p>
              <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
                <li>Seu plano continua ativo até o fim do período pago</li>
                <li>Não haverá renovação automática</li>
                <li>Você pode reverter o cancelamento antes do encerramento</li>
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
                ? 'Assinatura cancelada com reembolso'
                : 'Cancelamento agendado'}
            </h2>

            {lockInfo?.cancellationMode === 'REFUND' ? (
              <p className="text-sm text-gray-600 mb-6">
                Sua assinatura foi cancelada dentro do período de arrependimento (CDC Art. 49).
                O reembolso será processado em até 7 dias úteis.
              </p>
            ) : (
              <div className="text-sm text-gray-600 mb-6 space-y-2">
                <p>
                  Seu cancelamento foi registrado. Você mantém o plano até{' '}
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
                  <li>Você pode reverter o cancelamento antes do encerramento</li>
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
