'use client'

import { useEffect, useState } from 'react'
import { TrophyCard, type TrophyType } from './TrophyCard'

interface LeagueTrophy {
  id:         string
  trophyType: TrophyType
  position:   number
  awardedAt:  string
  league: {
    id:       string
    name:     string
    startsAt: string
    endsAt:   string | null
  }
}

/**
 * TrophyList — lista todos os troféus do usuário autenticado.
 * Troféus são cosméticos — nota de transparência exibida.
 */
export function TrophyList() {
  const [trophies, setTrophies] = useState<LeagueTrophy[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(false)

  useEffect(() => {
    async function fetchTrophies() {
      try {
        const res = await fetch('/api/v1/users/me/trophies')
        if (!res.ok) { setError(true); return }
        const json = await res.json()
        setTrophies(json.data ?? [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchTrophies()
  }, [])

  if (loading) {
    return (
      <ul aria-label="Carregando trofeus" className="space-y-3">
        {[1, 2, 3].map((i) => (
          <li key={i} aria-hidden className="h-20 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </ul>
    )
  }

  if (error) {
    return (
      <p className="text-center text-sm text-red-400 py-6">
        Erro ao carregar trofeus. Tente novamente.
      </p>
    )
  }

  if (trophies.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <p className="text-sm text-gray-500">
          Participe de Ligas PRO para conquistar trofeus.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-600 text-center">
        Trofeus sao cosmeticos — sem valor monetario.
      </p>
      <ul className="space-y-2" aria-label="Meus trofeus">
        {trophies.map((t) => (
          <li key={t.id}>
            <TrophyCard
              trophyType={t.trophyType}
              leagueName={t.league.name}
              awardedAt={t.awardedAt}
              leagueStart={t.league.startsAt}
              leagueEnd={t.league.endsAt}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
