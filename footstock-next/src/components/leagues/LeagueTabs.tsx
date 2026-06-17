'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useAnalytics } from '@/hooks/useAnalytics'
import { LeagueCard } from './LeagueCard'
import { SponsoredLeagueCard } from './SponsoredLeagueCard'
import { useLeagues, useMyLeagues, useMyCreatedLeagues } from '@/hooks/useLeagues'
import { useSponsoredLeagues, type SponsoredLeaguePublic } from '@/hooks/useSponsoredLeagues'
import type { League } from '@/types'

type Tab = 'minhas' | 'publicas' | 'amigos' | 'pro'

const TABS: { id: Tab; label: string }[] = [
  { id: 'minhas',        label: 'Minhas'        },
  { id: 'publicas',      label: 'Publicas'      },
  { id: 'amigos',        label: 'Amigos'        },
  { id: 'pro',           label: 'PRO'           },
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

function SponsoredLeagueList({
  leagues,
  isPending,
}: {
  leagues: SponsoredLeaguePublic[]
  isPending: boolean
}) {
  if (isPending) {
    return (
      <ul aria-label="Carregando ligas patrocinadas" className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} aria-hidden="true">
            <div className="h-36 rounded-xl bg-white/5 animate-pulse" />
          </li>
        ))}
      </ul>
    )
  }

  if (leagues.length === 0) {
    return (
      <p className="text-center text-sm text-gray-500 py-10">
        Nenhuma liga patrocinada disponível no momento.
      </p>
    )
  }

  return (
    <ul className="space-y-3" data-testid="sponsored-league-list">
      {leagues.map(league => (
        <li key={league.id}>
          <SponsoredLeagueCard league={league} />
        </li>
      ))}
    </ul>
  )
}

export function LeagueTabs() {
  const [activeTab, setActiveTab] = useState<Tab>('minhas')
  const { track } = useAnalytics()
  const trackedRef = useRef(false)

  // Membership (para o set "isMember" dos cards das outras abas) — distinto de "Minhas".
  const { data: myLeagues = [], isPending: myPending }             = useMyLeagues()
  // Item 19: "Minhas" = ligas que o usuario CRIOU (createdBy === me).
  const { data: myCreatedLeagues = [], isPending: myCreatedPending } = useMyCreatedLeagues()
  const { data: publicLeagues = [], isPending: publicPending }     = useLeagues('PUBLICA')
  const { data: friendLeagues = [], isPending: friendPending }     = useLeagues('AMIGOS')
  const { data: proLeagues = [], isPending: proPending }           = useLeagues('PRO')
  const { data: sponsoredLeagues = [], isPending: sponsorPending } = useSponsoredLeagues('ATIVA')

  const myLeagueIds = new Set(myLeagues.map(l => l.id))

  // EVT-025: league_viewed — rastreia visualizacao da pagina de ligas
  useEffect(() => {
    if (trackedRef.current || myPending) return
    trackedRef.current = true

    track('league_viewed', {
      plan: 'JOGADOR' as const,
      has_active_league: myLeagues.length > 0,
    })
  }, [track, myPending, myLeagues.length])

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
            data-testid={`league-tab-${tab.id}`}
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

      {/* Tab panel - Minhas (regular + sponsored leagues the user has joined) */}
      <div
        role="tabpanel"
        id="tabpanel-minhas"
        aria-labelledby="tab-minhas"
        hidden={activeTab !== 'minhas'}
      >
        {activeTab === 'minhas' && (
          // Item 19: "Minhas" = ligas que o usuario CRIOU (createdBy === me), nao todas em que e membro.
          // As ligas em que entrou via convite aparecem em "Amigos"; publicas/PRO nas abas globais.
          <LeagueList
            leagues={myCreatedLeagues}
            myLeagueIds={myLeagueIds}
            isPending={myCreatedPending}
          />
        )}
      </div>

      {/* Tab panels - Publicas + Amigos */}
      {(['publicas', 'amigos'] as const).map(tabId => {
        const tabData: Record<typeof tabId, { leagues: League[]; isPending: boolean }> = {
          publicas: { leagues: publicLeagues, isPending: publicPending },
          amigos:   { leagues: friendLeagues, isPending: friendPending },
        }
        const { leagues, isPending } = tabData[tabId]

        return (
          <div
            key={tabId}
            role="tabpanel"
            id={`tabpanel-${tabId}`}
            aria-labelledby={`tab-${tabId}`}
            hidden={activeTab !== tabId}
          >
            {activeTab === tabId && (
              <LeagueList
                leagues={leagues}
                myLeagueIds={myLeagueIds}
                isPending={isPending}
              />
            )}
          </div>
        )
      })}

      {/* Tab panel - PRO (item 22: "Pro" e "Patrocinadas" eram duplicatas; uma unica aba "PRO"
          reune as ligas PRO e as patrocinadas por empresa, ambas criadas pelo ADM). */}
      <div
        role="tabpanel"
        id="tabpanel-pro"
        aria-labelledby="tab-pro"
        hidden={activeTab !== 'pro'}
      >
        {activeTab === 'pro' && (() => {
          const proEmpty = !proPending && proLeagues.length === 0
          const sponsoredEmpty = !sponsorPending && sponsoredLeagues.length === 0
          if (proEmpty && sponsoredEmpty) {
            return (
              <p className="text-center text-sm text-gray-500 py-10">
                Nenhuma liga PRO disponível no momento.
              </p>
            )
          }
          return (
            <div className="space-y-3">
              {(proPending || proLeagues.length > 0) && (
                <LeagueList
                  leagues={proLeagues}
                  myLeagueIds={myLeagueIds}
                  isPending={proPending}
                />
              )}
              {(sponsorPending || sponsoredLeagues.length > 0) && (
                <SponsoredLeagueList
                  leagues={sponsoredLeagues}
                  isPending={sponsorPending}
                />
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
