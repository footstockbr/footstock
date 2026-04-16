// ============================================================================
// FootStock — Club Portal Layout
// Protege toda a subárvore /club/(portal)/* via withClubAuth().
// Apenas usuários CLUB_PARTNER autenticados chegam até aqui.
// ============================================================================

import type { Metadata } from 'next'
import { ClubSidebar } from '@/components/club/ClubSidebar'
import { withClubAuth } from '@/lib/auth/club-auth'

export const metadata: Metadata = {
  title: 'Portal do Clube — FootStock',
}

export default async function ClubPortalLayout({ children }: { children: React.ReactNode }) {
  // Proteção de rota: redireciona para /club/login se não autenticado ou role incorreto.
  // withClubAuth() chama redirect() internamente — nenhum try/catch aqui.
  await withClubAuth()

  return (
    // flex-col mobile: header acima do conteúdo. md:flex-row: sidebar ao lado.
    <div className="min-h-dvh md:h-dvh md:overflow-hidden flex flex-col md:flex-row bg-[#0B0E11]">
      <ClubSidebar />

      <main className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
    </div>
  )
}
