// ============================================================================
// Foot Stock — /mercado (Server Component)
// SSR prefetch via HydrationBoundary + metadados SEO.
// ============================================================================

import type { Metadata } from 'next'
import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout'
import MarketPage from '@/components/market/MarketPage'

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

  // SSR prefetch dos ativos (sem delay — usuário não autenticado ainda)
  // O componente cliente re-busca com autenticação e delay correto
  try {
    await queryClient.prefetchInfiniteQuery({
      queryKey: ['assets', {}] as const,
      queryFn: async () => {
        // No server não há acesso ao token de usuário — retorna vazio para SSR
        return { data: [], total: 0, page: 1, limit: 20, _delaySeconds: 0, _cacheHint: '' }
      },
      initialPageParam: 1,
    })
  } catch {
    // SSR prefetch é best-effort — não bloquear a página
  }

  return (
    <AppLayout>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <MarketPage />
      </HydrationBoundary>
    </AppLayout>
  )
}
