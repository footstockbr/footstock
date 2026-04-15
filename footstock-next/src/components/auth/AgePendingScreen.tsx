'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * T-023: Tela exibida para usuários com ageVerificationPending=true.
 * Informa que a verificação está em andamento e permite atualizar o status.
 * Quando a verificação é concluída, redireciona automaticamente.
 */
export function AgePendingScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/auth/age-verification-status', {
        credentials: 'include',
      })

      if (!res.ok) {
        setError('Erro ao consultar status. Tente novamente.')
        return
      }

      const json = await res.json() as {
        success: boolean
        data: { pending: boolean; verified: boolean }
      }

      if (json.data.verified && !json.data.pending) {
        // Verificação concluída — redirecionar para home
        router.push('/dashboard')
        return
      }

      // Ainda pendente
      setError('Verificação ainda em andamento. Tente novamente em alguns instantes.')
    } catch {
      setError('Falha na conexão. Verifique sua internet e tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [router])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full flex flex-col items-center gap-6 text-center">
        {/* Ícone */}
        <div className="w-16 h-16 rounded-full bg-[rgba(240,185,11,.1)] flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-[#F0B90B]" aria-hidden="true" />
        </div>

        {/* Título */}
        <h1 className="text-xl font-bold text-[#EAECEF]">
          Verificação de maioridade em andamento
        </h1>

        {/* Mensagem */}
        <p className="text-sm text-[#929AA5] leading-relaxed">
          Estamos verificando sua maioridade. Isso pode levar alguns instantes.
          Enquanto isso, algumas funcionalidades estarão restritas.
        </p>

        {/* Feedback de erro */}
        {error && (
          <div
            className="w-full bg-[rgba(246,70,93,.08)] border border-[rgba(246,70,93,.2)] rounded-lg p-3 text-sm text-[#F6465D]"
            role="alert"
          >
            {error}
          </div>
        )}

        {/* Botão de atualizar */}
        <Button
          data-testid="age-pending-refresh-button"
          variant="outline"
          size="lg"
          fullWidth
          onClick={checkStatus}
          disabled={loading}
          aria-busy={loading}
          className="border-[rgba(240,185,11,.3)] text-[#F0B90B] hover:bg-[rgba(240,185,11,.08)]"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
              Verificando...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
              Atualizar status
            </>
          )}
        </Button>

        {/* Info adicional */}
        <p className="text-xs text-[#707A8A]">
          Se o problema persistir, entre em contato com o suporte.
        </p>
      </div>
    </div>
  )
}
