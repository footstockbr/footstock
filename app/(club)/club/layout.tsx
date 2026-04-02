// ============================================================================
// Foot Stock — Club Portal Layout (Server Component)
// Layout independente do admin: sem sidebar, header minimalista.
// Rastreabilidade: INT-084, US-025, TASK-1/ST001
// ============================================================================

import type { Metadata } from 'next'
import { IBM_Plex_Sans } from 'next/font/google'
import { ClubSidebar } from '@/components/club/ClubSidebar'

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
        <div className="flex min-h-screen flex-col md:flex-row">
          <ClubSidebar />
          <div className="flex flex-1 flex-col">
            <main className="flex-1 p-4 md:p-6">{children}</main>
            <footer className="border-t border-white/5 px-4 py-6 text-center text-xs text-zinc-600">
              Foot Stock © 2026 — Portal exclusivo para clubes parceiros
            </footer>
          </div>
        </div>
      </body>
    </html>
  )
}
