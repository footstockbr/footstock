'use client'

// ============================================================================
// RevertCancellationButton — botão de reversão de CANCELLATION_LOCK
// Chama PUT /api/v1/subscriptions/me/revert e recarrega a página em sucesso
// ============================================================================

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  className?: string
}

export function RevertCancellationButton({ className = '' }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRevert() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/subscriptions/me/revert', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      })

      const json = await res.json()

      if (!res.ok) {
        setError(
          json?.message ?? 'Ocorreu um erro ao reverter o cancelamento. Tente novamente.'
        )
        return
      }

      // Sucesso: recarrega para atualizar o estado da assinatura
      router.refresh()
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={className}>
      <button
        onClick={handleRevert}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
            Revertendo...
          </>
        ) : (
          'Reverter cancelamento'
        )}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>
      )}
    </div>
  )
}
