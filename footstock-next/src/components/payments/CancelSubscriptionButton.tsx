'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROUTES } from '@/lib/constants/routes'

interface CancelSubscriptionButtonProps {
  isEligibleForRefund: boolean
}

export function CancelSubscriptionButton({ isEligibleForRefund }: CancelSubscriptionButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  async function handleCancel() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/subscriptions/me', { method: 'DELETE' })
      const json = await res.json()

      if (!res.ok) {
        setError(json?.error?.message ?? 'Erro ao cancelar. Tente novamente.')
        return
      }

      router.push(ROUTES.PLANOS)
      router.refresh()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div
        className="bg-[rgba(246,70,93,.06)] border border-[rgba(246,70,93,.2)] rounded-xl p-4 flex flex-col gap-3"
        data-testid="cancel-confirm-dialog"
      >
        <p className="text-sm text-[#EAECEF] font-medium">Confirmar cancelamento?</p>
        <p className="text-xs text-[#929AA5]">
          {isEligibleForRefund
            ? 'Seu plano permanece ativo até o fim do período atual. Reembolso integral é uma solicitação separada dentro dos 7 dias.'
            : 'Seu plano permanece ativo até o fim do período atual. Depois, você volta ao plano gratuito Jogador.'}
        </p>
        {error && (
          <p className="text-xs text-[#F6465D]" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="flex-1 py-2 rounded-lg border border-[rgba(240,185,11,.2)] text-[#929AA5] text-sm"
            data-testid="cancel-confirm-no"
          >
            Voltar
          </button>
          <button
            onClick={handleCancel}
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-[rgba(246,70,93,.15)] border border-[rgba(246,70,93,.3)] text-[#F6465D] text-sm font-medium"
            data-testid="cancel-confirm-yes"
          >
            {loading ? 'Cancelando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full py-2.5 rounded-lg border border-[rgba(246,70,93,.2)] text-[#F6465D] text-sm"
      data-testid="cancel-subscription-button"
    >
      Cancelar assinatura
    </button>
  )
}
