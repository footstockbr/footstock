// ============================================================================
// Foot Stock — /mercado (Server Component)
// SSR prefetch via HydrationBoundary + metadados SEO.
// ============================================================================

import type { Metadata } from 'next'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout'
import MarketPage from '@/components/market/MarketPage'
import { SponsorBanner } from '@/components/banners/SponsorBanner'
import { prefetchMarketData } from '@/lib/server/prefetch-market'

// Dados de mercado near-real-time — sempre SSR dinâmico
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mercado',
  description:
    'Acompanhe os 40 ativos em tempo real. Filtre por divisão, sentimento e busque seu clube favorito.',
  openGraph: {
    title: 'Mercado | Foot Stock',
    description: 'Simulador financeiro de futebol brasileiro com 40 ativos em tempo real.',
  },
}

export default async function MercadoPage() {
  const queryClient = new QueryClient()
  // RESOLVED: T002 – SSR Prefetch quebrado — prefetchMarketData não era chamado
  await prefetchMarketData(queryClient)

  return (
    <AppLayout>
      <SponsorBanner position="market_top" className="mb-2" />
      <HydrationBoundary state={dehydrate(queryClient)}>
        <MarketPage />
      </HydrationBoundary>
    </AppLayout>
  )
}
