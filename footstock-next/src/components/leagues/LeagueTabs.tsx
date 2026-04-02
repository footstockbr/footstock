'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { LeagueCard } from './LeagueCard'
import { useLeagues, useMyLeagues } from '@/hooks/useLeagues'
import type { League } from '@/types'

type Tab = 'minhas' | 'publicas' | 'amigos'

const TABS: { id: Tab; label: string }[] = [
  { id: 'minhas',   label: 'Minhas'   },
  { id: 'publicas', label: 'Públicas' },
  { id: 'amigos',   label: 'Amigos'   },
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
          <li key={i} aria-hidden="true">
            <div className="h-28 rounded-xl bg-white/5 animate-pulse" />
          </li>
        ))}
      </ul>
    )
  }

  if (leagues.length === 0) {
    return (
      <p className="text-center text-sm text-gray-500 py-10">
        Nenhuma liga encontrada.
      </p>
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

  const { data: myLeagues = [], isPending: myPending }        = useMyLeagues()
  const { data: publicLeagues = [], isPending: publicPending } = useLeagues('PUBLICA')
  const { data: friendLeagues = [], isPending: friendPending } = useLeagues('AMIGOS')

  const myLeagueIds = new Set(myLeagues.map(l => l.id))

  const tabData: Record<Tab, { leagues: League[]; isPending: boolean }> = {
    minhas:   { leagues: myLeagues,      isPending: myPending     },
    publicas: { leagues: publicLeagues,  isPending: publicPending },
    amigos:   { leagues: friendLeagues,  isPending: friendPending },
  }

  const { leagues, isPending } = tabData[activeTab]

  return (
    <div>
      {/* Tab list */}
      <div
        role="tablist"
        aria-label="Filtrar ligas"
        className="flex gap-1 p-1 bg-[#1E2329] rounded-lg mb-4"
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
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
