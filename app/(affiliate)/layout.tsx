// ============================================================================
// Foot Stock — Affiliate Layout (Server Component)
// Layout minimalista para o portal de influenciadores afiliados.
// Sem sidebar; sem dados de usuário comuns no app principal.
// Rastreabilidade: INT-084, US-036, TASK-3/ST004
// ============================================================================

import type { Metadata } from 'next'
import { LogoutButton } from '@/components/ui/LogoutButton'

export const metadata: Metadata = {
  title: 'Portal do Afiliado | Foot Stock',
  description: 'Portal exclusivo para influenciadores afiliados da plataforma Foot Stock.',
  robots: 'noindex, nofollow',
}

export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080808] text-zinc-100">
      {/* Header minimal */}
      <header className="border-b border-white/5 px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          {/* Logo + título */}
          <div className="flex items-center gap-3">
            <svg
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect width="32" height="32" rx="8" fill="#C9A84C" fillOpacity="0.15" />
              <path
                d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6Z"
                stroke="#C9A84C"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M13 16h6M16 13v6"
                stroke="#C9A84C"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-sm font-semibold text-zinc-200">
              Foot Stock — <span className="text-[#C9A84C]">Portal do Afiliado</span>
            </span>
          </div>

          {/* Logout */}
          <LogoutButton />
        </div>
      </header>

      {/* Conteúdo */}
      <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>

      {/* Footer */}
      <footer className="border-t border-white/5 px-4 py-4 text-center text-xs text-zinc-600">
        Foot Stock © {new Date().getFullYear()} — Portal exclusivo para afiliados parceiros
      </footer>
    </div>
  )
}
