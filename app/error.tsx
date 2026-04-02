'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export default function Error({
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
    <main className="min-h-dvh bg-bg-primary text-text-primary flex items-center justify-center px-4">
      <section className="w-full max-w-md rounded-xl border border-border-default bg-bg-card p-6 text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-[#F6465D]/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-[#F6465D]" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-semibold text-text-primary">Algo deu errado</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Ocorreu um erro inesperado. Tente novamente ou volte para o início.
        </p>

        {error.digest && (
          <p className="mt-2 font-mono text-xs text-text-secondary/60">
            Código: {error.digest}
          </p>
        )}

        <div className="mt-6 flex gap-3 justify-center">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg border border-border-default px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:border-border-default/60 transition-colors"
          >
            <Home className="w-4 h-4" />
            Início
          </Link>

          <button
            onClick={reset}
            className="flex items-center gap-2 rounded-lg bg-[#F0B90B] px-4 py-2.5 text-sm font-semibold text-[#0B0E11] hover:bg-[#F0B90B]/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      </section>
    </main>
  )
}
