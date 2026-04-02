// ============================================================================
// Foot Stock — /planos: Server Component com metadata + client wrapper
// GAP-001: metadata separada em Server Component (ignorada em 'use client')
// ============================================================================

import { Metadata } from 'next'
import { Suspense } from 'react'
import PlansPageClient from './PlansPageClient'

export const metadata: Metadata = {
  title: 'Planos | Foot Stock',
  description: 'Escolha o plano ideal para você — Jogador, Craque ou Lenda.',
}

export default function PlanosPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950" aria-busy="true" />}>
      <PlansPageClient />
    </Suspense>
  )
}
