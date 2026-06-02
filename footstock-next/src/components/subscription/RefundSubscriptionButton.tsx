'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RefundSubscriptionButton() {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRefund() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/subscriptions/me/refund', { method: 'POST' })
      const json = await res.json()

      if (!res.ok) {
        setError(json?.error?.message ?? 'Nao foi possivel solicitar reembolso.')
        return
      }

      router.refresh()
    } catch {
      setError('Erro de conexao. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (confirming) {
    return (
      <div className="mt-3 rounded-lg border border-[rgba(246,70,93,.25)] bg-[rgba(246,70,93,.06)] p-3">
        <p className="text-xs font-medium text-[#EAECEF]">
          Confirmar reembolso integral?
        </p>
        <p className="mt-1 text-xs text-[#929AA5]">
          Seu plano será encerrado imediatamente e você voltará ao plano gratuito Jogador. Sua conta e histórico continuam.
        </p>
        {error && (
          <p className="mt-2 text-xs text-[#F6465D]" role="alert">
            {error}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="flex-1 rounded-md border border-[rgba(240,185,11,.2)] px-3 py-2 text-xs text-[#929AA5]"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleRefund}
            disabled={loading}
            className="flex-1 rounded-md bg-[rgba(246,70,93,.16)] px-3 py-2 text-xs font-medium text-[#F6465D]"
          >
            {loading ? 'Solicitando...' : 'Confirmar reembolso'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="mt-3 rounded-md border border-[rgba(246,70,93,.25)] px-3 py-2 text-xs font-medium text-[#F6465D]"
    >
      Solicitar reembolso integral
    </button>
  )
}
