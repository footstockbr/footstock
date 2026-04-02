'use client'

// ============================================================================
// Foot Stock — /mercado/[ticker]/error.tsx
// Error boundary para a página de detalhe de ativo.
// ============================================================================

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import { AppLayout } from '@/components/layout'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function MercadoDetalheError({ error, reset }: ErrorPageProps) {
  const router = useRouter()

  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 pt-4 pb-8">
        <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-[#F6465D]/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-[#F6465D]" aria-hidden="true" />
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-bold text-[#EAECEF]">
              Erro ao carregar ativo
            </h1>
            <p className="text-sm text-[#929AA5] max-w-sm">
              Não foi possível carregar as informações deste ativo. Verifique sua conexão
              e tente novamente.
            </p>
            {error.digest && (
              <p className="text-xs text-[#929AA5]/60 font-mono mt-1">
                Código: {error.digest}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#2B3139] text-sm text-[#929AA5] hover:text-[#EAECEF] hover:border-[#EAECEF]/30 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>

            <button
              onClick={reset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F0B90B] text-[#0B0E11] text-sm font-semibold hover:bg-[#F0B90B]/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
