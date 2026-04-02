// ============================================================================
// Foot Stock — /noticias (Server Component)
// Pagina de noticias com metadados SEO.
// Rastreabilidade: module-17-rss-noticias / TASK-5
// ============================================================================

import type { Metadata } from 'next'
import { AppLayout } from '@/components/layout'
import NoticiasClient from '@/components/news/NoticiasClient'

// Notícias em tempo real — sempre SSR dinâmico
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Noticias | Foot Stock',
  description: 'Noticias de futebol com impacto nos precos dos ativos.',
  openGraph: {
    title: 'Noticias | Foot Stock',
    description: 'Acompanhe as noticias que movem o mercado do futebol brasileiro.',
  },
}

export default function NoticiasPage() {
  return (
    <AppLayout>
      <NoticiasClient />
    </AppLayout>
  )
}
