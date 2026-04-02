// ============================================================================
// Foot Stock — /dashboard (module-15, TASK-2/ST006)
// Tab 1 — Patrimônio e P&L em tempo real.
// Rastreabilidade: INT-023, INT-024
// ============================================================================

import type { Metadata } from 'next'
import { DashboardClient } from './DashboardClient'
import { SponsorBanner } from '@/components/banners/SponsorBanner'

export const metadata: Metadata = {
  title: 'Dashboard | Foot Stock',
  description: 'Seu patrimônio e P&L em tempo real',
}

export default function DashboardPage() {
  return (
    <>
      <SponsorBanner position="home_top" className="mb-2" />
      <DashboardClient />
    </>
  )
}
