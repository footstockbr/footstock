'use client'

// ============================================================================
// Foot Stock — Portal do Afiliado error boundary
// ============================================================================

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { ROUTES } from '@/lib/constants'

export default function AffiliateError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/5 p-6 text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-400" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-semibold text-zinc-100">Erro ao carregar portal</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Não foi possível carregar os dados do portal. Tente novamente.
        </p>

        {error.digest && (
          <p className="mt-2 font-mono text-xs text-zinc-600">
            Código: {error.digest}
          </p>
        )}

        <div className="mt-6 flex gap-3 justify-center">
          <Link
            href={ROUTES.AFFILIATE}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Início
          </Link>

          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg bg-[#C9A84C] px-4 py-2.5 text-sm font-semibold text-[#080808] hover:bg-[#C9A84C]/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  )
}
