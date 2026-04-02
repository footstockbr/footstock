'use client'

import { useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { LeagueCard } from './LeagueCard'
import { useLeagues, useMyLeagues } from '@/hooks/useLeagues'
import type { League } from '@/types'

type Tab = 'minhas' | 'publicas' | 'amigos' | 'pro'

const TABS: { id: Tab; label: string }[] = [
  { id: 'minhas',   label: 'Minhas'   },
  { id: 'publicas', label: 'Públicas' },
  { id: 'amigos',   label: 'Amigos'   },
  { id: 'pro',      label: 'PRO'      },
]

function LeagueList({
  leagues,
  myLeagueIds,
  isPending,
}: {
  leagues: League[]
  myLeagueIds: Set<string>
  isPending: boolean
}) {
  if (isPending) {
    return (
      <ul aria-label="Carregando ligas" className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="h-28 rounded-xl" />
          </li>
        ))}
      </ul>
    )
  }

  if (leagues.length === 0) {
    return (
      <EmptyState
        icon={<Trophy className="h-8 w-8 text-gray-600" />}
        title="Nenhuma liga encontrada"
        description="Quando houver ligas nesta categoria, elas aparecerão aqui."
      />
    )
  }

  return (
    <ul className="space-y-3">
      {leagues.map(league => (
        <li key={league.id}>
          <LeagueCard
            league={league}
            isMember={myLeagueIds.has(league.id)}
          />
        </li>
      ))}
    </ul>
  )
}

export function LeagueTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('minhas')
  const tabRefs = useRef<Map<Tab, HTMLButtonElement>>(new Map())

  const { data: myLeagues = [], isPending: myPending }        = useMyLeagues()
  const { data: publicLeagues = [], isPending: publicPending } = useLeagues('PUBLICA')
  const { data: friendLeagues = [], isPending: friendPending } = useLeagues('AMIGOS')
  const { data: proLeagues = [], isPending: proPending }       = useLeagues('PRO')

  const myLeagueIds = new Set(myLeagues.map(l => l.id))

  const tabData: Record<Tab, { leagues: League[]; isPending: boolean }> = {
    minhas:   { leagues: myLeagues,      isPending: myPending     },
    publicas: { leagues: publicLeagues,  isPending: publicPending },
    amigos:   { leagues: friendLeagues,  isPending: friendPending },
    pro:      { leagues: proLeagues,     isPending: proPending    },
  }

  const { leagues, isPending } = tabData[activeTab]

  function handleKeyDown(e: React.KeyboardEvent) {
    const tabIds = TABS.map(t => t.id)
    const currentIndex = tabIds.indexOf(activeTab)
    let nextIndex = currentIndex

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      nextIndex = (currentIndex + 1) % tabIds.length
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length
    } else {
      return
    }

    const nextTab = tabIds[nextIndex]
    if (!nextTab) return
    setActiveTab(nextTab)
    tabRefs.current.get(nextTab)?.focus()
  }

  return (
    <div>
      {/* Tab list */}
      <div
        role="tablist"
        aria-label="Filtrar ligas"
        className="flex gap-1 p-1 bg-[#1E2329] rounded-lg mb-4"
        onKeyDown={handleKeyDown}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            ref={(el) => { if (el) tabRefs.current.set(tab.id, el) }}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 py-1.5 text-xs font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]',
              activeTab === tab.id
                ? 'bg-[#F0B90B] text-black'
                : 'text-gray-400 hover:text-[#EAECEF]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {TABS.map(tab => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tabpanel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={activeTab !== tab.id}
        >
          {activeTab === tab.id && (
            <LeagueList
              leagues={leagues}
              myLeagueIds={myLeagueIds}
              isPending={isPending}
            />
          )}
        </div>
      ))}
    </div>
  )
}
