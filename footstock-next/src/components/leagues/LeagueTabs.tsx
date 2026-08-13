'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useAnalytics } from '@/hooks/useAnalytics'
import { LeagueCard } from './LeagueCard'
import { useLeagues, useMyLeagues, useMyCreatedLeagues } from '@/hooks/useLeagues'
import type { League } from '@/types'

type Tab = 'memberships' | 'publicas' | 'amigos' | 'pro' | 'criadas'

const TABS: { id: Tab; label: string }[] = [
  { id: 'memberships', label: 'Minhas'        },
  { id: 'publicas',    label: 'Publicas'      },
  { id: 'amigos',      label: 'Amigos'        },
  { id: 'pro',         label: 'PRO'           },
  { id: 'criadas',     label: 'Criadas por mim' },
]

interface LeagueListProps {
  leagues: League[]
  myLeagueIds: Set<string>
  isPending: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
  emptyMessage: string
  'data-testid'?: string
}

function LeagueList({
  leagues,
  myLeagueIds,
  isPending,
  isError,
  error,
  refetch,
  emptyMessage,
  'data-testid': testId,
}: LeagueListProps) {
  if (isPending) {
    return (
      <div data-testid="league-list-loading" aria-busy="true" aria-label="Carregando ligas">
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} aria-hidden="true">
              <div className="h-28 rounded-xl bg-white/5 animate-pulse" />
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (isError) {
    return (
      <div
        data-testid="league-list-error"
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-950"
      >
        <p className="text-sm font-medium text-red-800 dark:text-red-100">
          {error?.message ?? 'Erro ao carregar ligas.'}
        </p>
        <button
          type="button"
          onClick={refetch}
          data-testid="league-list-retry"
          className="mt-3 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (leagues.length === 0) {
    return (
      <p
        data-testid="league-list-empty"
        className="text-center text-sm text-gray-500 py-10"
      >
        {emptyMessage}
      </p>
    )
  }

  return (
    <ul className="space-y-3" data-testid={testId}>
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
  const [activeTab, setActiveTab] = useState<Tab>('memberships')
  const { track } = useAnalytics()
  const trackedRef = useRef(false)

  // Memberships (ligas em que o usuario participa).
  const {
    data: myLeagues = [],
    isPending: myPending,
    isError: myIsError,
    error: myError,
    refetch: refetchMy,
  } = useMyLeagues()

  // Ligas criadas pelo usuario (autoria).
  const {
    data: myCreatedLeagues = [],
    isPending: myCreatedPending,
    isError: myCreatedIsError,
    error: myCreatedError,
    refetch: refetchMyCreated,
  } = useMyCreatedLeagues()

  // Ligas publicas, de amigos e PRO.
  const {
    data: publicLeagues = [],
    isPending: publicPending,
    isError: publicIsError,
    error: publicError,
    refetch: refetchPublic,
  } = useLeagues('PUBLICA')

  const {
    data: friendLeagues = [],
    isPending: friendPending,
    isError: friendIsError,
    error: friendError,
    refetch: refetchFriend,
  } = useLeagues('AMIGOS')

  const {
    data: proLeagues = [],
    isPending: proPending,
    isError: proIsError,
    error: proError,
    refetch: refetchPro,
  } = useLeagues('PRO')

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

  const tabData: Record<Tab, Omit<LeagueListProps, 'myLeagueIds'>> = {
    memberships: {
      leagues: myLeagues,
      isPending: myPending,
      isError: myIsError,
      error: myError,
      refetch: refetchMy,
      emptyMessage: 'Voce ainda nao participa de nenhuma liga.',
      'data-testid': 'league-list-memberships',
    },
    publicas: {
      leagues: publicLeagues,
      isPending: publicPending,
      isError: publicIsError,
      error: publicError,
      refetch: refetchPublic,
      emptyMessage: 'Nenhuma liga publica disponivel no momento.',
      'data-testid': 'league-list-publicas',
    },
    amigos: {
      leagues: friendLeagues,
      isPending: friendPending,
      isError: friendIsError,
      error: friendError,
      refetch: refetchFriend,
      emptyMessage: 'Nenhuma liga de amigos encontrada.',
      'data-testid': 'league-list-amigos',
    },
    pro: {
      leagues: proLeagues,
      isPending: proPending,
      isError: proIsError,
      error: proError,
      refetch: refetchPro,
      emptyMessage: 'Nenhuma liga PRO disponivel no momento.',
      'data-testid': 'league-list-pro',
    },
    criadas: {
      leagues: myCreatedLeagues,
      isPending: myCreatedPending,
      isError: myCreatedIsError,
      error: myCreatedError,
      refetch: refetchMyCreated,
      emptyMessage: 'Voce ainda nao criou nenhuma liga.',
      'data-testid': 'league-list-criadas',
    },
  }

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

      {/* Tab panels */}
      {TABS.map(tab => {
        const { leagues, ...listProps } = tabData[tab.id]
        return (
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
                {...listProps}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
