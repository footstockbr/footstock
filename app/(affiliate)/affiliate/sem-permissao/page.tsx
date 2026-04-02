// ============================================================================
// Foot Stock — Affiliate Sem Permissão
// Página exibida quando usuário tenta acessar o portal de afiliados
// sem ter um código de afiliado ativo.
// Rastreabilidade: INT-084, US-036, TASK-3/ST004
// ============================================================================

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Acesso Restrito | Foot Stock Afiliados',
  robots: 'noindex, nofollow',
}

export default function AffiliateNoAccessPage() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 text-center">
      {/* Ícone decorativo */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-zinc-900">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#C9A84C"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <div className="space-y-2">
        <h1 className="text-xl font-bold text-zinc-100">Acesso Restrito</h1>
        <p className="max-w-sm text-sm text-zinc-500">
          Você não possui um código de afiliado ativo na plataforma Foot Stock.
          Para se tornar um afiliado, entre em contato com nossa equipe.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex min-h-[48px] items-center rounded-lg border border-zinc-700 bg-transparent px-6 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
      >
        Voltar ao início
      </Link>
    </main>
  )
}
