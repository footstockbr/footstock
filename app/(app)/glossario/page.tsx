// ============================================================================
// Foot Stock — /glossario (Server Component + GlossarioClient)
// Fonte: module-18/TASK-3/ST005
// ============================================================================

import type { Metadata } from 'next'
import { AppLayout } from '@/components/layout'
import GlossarioClient from '@/components/glossary/GlossarioClient'

export const metadata: Metadata = {
  title: 'Glossário | Foot Stock',
  description: 'Glossário completo com 116 termos de análise técnica, fundamentalista, trading e futebol.',
  openGraph: {
    title: 'Glossário | Foot Stock',
    description: 'Entenda todos os termos do mercado de capitais e do futebol no Foot Stock.',
  },
}

export default function GlossarioPage() {
  return (
    <AppLayout>
      <GlossarioClient />
    </AppLayout>
  )
}
