// ============================================================================
// Foot Stock — /assessor layout (Server Component para SEO metadata)
// Fonte: module-21/TASK-4/ST005 (GAP-005)
// ============================================================================

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Assessor IA | Foot Stock',
  description:
    'Análise fundamentalista de ativos de futebol em tempo real com inteligência artificial. Recomendações de compra, venda e manutenção baseadas em dados do mercado.',
}

export default function AssessorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
