import type { Metadata } from 'next'
import Link from 'next/link'
import { ROUTES } from '@/lib/constants/routes'

export const metadata: Metadata = {
  robots: { index: true, follow: true },
}

/**
 * Layout para rotas públicas (privacidade, termos, etc).
 * Sem autenticação obrigatória.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080808] text-[#f0ead6]">
      <header className="border-b border-[rgba(201,168,76,.12)] px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link
            href={ROUTES.HOME}
            className="text-sm font-semibold text-[#c9a84c] hover:text-[#d4b466] transition-colors"
          >
            ← Foot Stock
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-10">{children}</main>
      <footer className="border-t border-[rgba(201,168,76,.12)] px-4 py-6 mt-10">
        <div className="max-w-3xl mx-auto text-xs text-[#4a3d2a] text-center">
          © {new Date().getFullYear()} Foot Stock. Plataforma educacional de simulação financeira.
        </div>
      </footer>
    </div>
  )
}
