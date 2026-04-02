// ============================================================================
// Foot Stock — Club Portal Layout (Server Component)
// Layout independente do admin: sem sidebar, header minimalista.
// Rastreabilidade: INT-084, US-025, TASK-1/ST001
// ============================================================================

import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import { LogoutButton } from '@/components/ui/LogoutButton'

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
})

export const metadata: Metadata = {
  title: 'Portal do Clube | Foot Stock',
  description: 'Acesso exclusivo para clubes parceiros',
  robots: 'noindex, nofollow',
}

export default function ClubLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={ibmPlexSans.variable}>
      <body className="min-h-screen bg-[#080808] font-sans text-zinc-100 antialiased">
        <header className="border-b border-white/5 px-4 py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            {/* Logo + título */}
            <div className="flex items-center gap-3">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-label="Foot Stock logo"
              >
                <circle cx="16" cy="16" r="16" fill="#C9A84C" fillOpacity="0.15" />
                <path
                  d="M16 6L20 14H28L22 19L24 27L16 22L8 27L10 19L4 14H12L16 6Z"
                  fill="#C9A84C"
                />
              </svg>
              <span className="text-sm font-semibold tracking-wide text-zinc-100">
                Portal do Clube
              </span>
            </div>

            {/* Logout */}
            <LogoutButton />
          </div>
        </header>

        <main className="mx-auto max-w-5xl">{children}</main>

        <footer className="mt-16 border-t border-white/5 px-4 py-6 text-center text-xs text-zinc-600">
          Foot Stock © 2026 — Portal exclusivo para clubes parceiros
        </footer>
      </body>
    </html>
  )
}
