'use client'

// ============================================================================
// Foot Stock — Admin error boundary (grupo /admin)
// ============================================================================

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, LayoutDashboard } from 'lucide-react'

export default function AdminError({
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
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-400" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-semibold text-zinc-100">Erro no painel admin</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Ocorreu um erro inesperado. Tente novamente ou volte ao dashboard.
        </p>

        {error.digest && (
          <p className="mt-2 font-mono text-xs text-zinc-600">
            Código: {error.digest}
          </p>
        )}

        <div className="mt-6 flex gap-3 justify-center">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>

          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg bg-[#F0B90B] px-4 py-2.5 text-sm font-semibold text-[#0B0E11] hover:bg-[#F0B90B]/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  )
}
