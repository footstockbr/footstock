// ============================================================================
// Foot Stock — /club/login — Login exclusivo para clubes parceiros
// Auth separada do app principal. Role obrigatória: CLUB_PARTNER.
// Rastreabilidade: FDD painel-admin §2.12, MILESTONE-9 TASK-1/ST001-ST002
// ============================================================================

import { Suspense } from 'react'
import ClubLoginClient from './ClubLoginClient'

export default function ClubLoginPage() {
  return (
    <Suspense>
      <ClubLoginClient />
    </Suspense>
  )
}
