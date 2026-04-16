import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import { Trophy, Plus } from 'lucide-react'
import Link from 'next/link'

// Lazy-load heavy tabbed list (includes React Query + multiple sub-components)
const LeagueTabs = dynamic(
  () => import('@/components/leagues/LeagueTabs').then(m => m.LeagueTabs),
  {
    loading: () => (
      <div className="space-y-3" aria-busy="true" aria-label="Carregando ligas">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" aria-hidden="true" />
        ))}
      </div>
    ),
  }
)

export const metadata: Metadata = {
  title: 'Ligas — FootStock',
  description: 'Participe de ligas públicas ou crie sua própria liga com amigos.',
}

export default function LigasPage() {
  return (
    <div data-testid="page-ligas" className="px-4 pt-4 pb-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-bold text-[#EAECEF] flex items-center gap-2">
          <Trophy className="h-5 w-5 text-[#F0B90B]" aria-hidden="true" />
          Ligas
        </h1>
        <Link
          href="/ligas/criar"
          data-testid="ligas-create-button"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-[#F0B90B] text-black hover:bg-[#d4ad52] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B] min-h-[44px]"
          aria-label="Criar nova liga"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Criar
        </Link>
      </div>

      <LeagueTabs />
    </div>
  )
}
