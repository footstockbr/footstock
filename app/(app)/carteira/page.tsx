// ============================================================================
// Foot Stock — /carteira (module-15, TASK-3/ST004)
// Tab 3 — Posições, Shorts, Extrato, Dividendos.
// Rastreabilidade: INT-034, INT-035, INT-036
// ============================================================================

import type { Metadata } from 'next'
import { CarteiraClient } from './CarteiraClient'
import { SponsorBanner } from '@/components/banners/SponsorBanner'

export const metadata: Metadata = {
  title: 'Carteira | Foot Stock',
  description: 'Suas posições abertas e extrato de transações',
}

export default function CarteiraPage() {
  return (
    <>
      <CarteiraClient />
      <SponsorBanner position="cart_top" className="mt-4" />
    </>
  )
}
