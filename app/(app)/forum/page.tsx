// ============================================================================
// Foot Stock — /forum (Server Component + ForumClient)
// Página do fórum com metadados SEO
// Fonte: module-18/TASK-2/ST004
// ============================================================================

import type { Metadata } from 'next'
import { AppLayout } from '@/components/layout'
import ForumClient from '@/components/forum/ForumClient'

export const metadata: Metadata = {
  title: 'Fórum | Foot Stock',
  description: 'Compartilhe análises e discuta os ativos do mercado de futebol.',
  openGraph: {
    title: 'Fórum | Foot Stock',
    description: 'Analistas do mercado de futebol debatem e compartilham estratégias.',
  },
}

export default function ForumPage() {
  return (
    <AppLayout>
      <ForumClient />
    </AppLayout>
  )
}
