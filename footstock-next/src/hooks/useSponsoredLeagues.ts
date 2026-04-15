'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export interface SponsoredLeaguePrize {
  position: number
  label: string
  description: string
}

export interface SponsoredLeaguePublic {
  id: string
  name: string
  company: string
  prize: string
  prizes: SponsoredLeaguePrize[]
  sponsorUrl: string | null
  participants: number
  maxParticipants: number
  minPlan: string
  status: string
  borderColor: string
  startDate: string
  endDate: string
  isMember: boolean
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

async function fetchSponsoredLeagues(status = 'ATIVA'): Promise<SponsoredLeaguePublic[]> {
  const res = await fetch(`/api/v1/sponsored-leagues?status=${status}`, { credentials: 'include' })
  if (!res.ok) throw new Error('Erro ao buscar ligas patrocinadas')
  const json = await res.json()
  return json.data ?? []
}

async function fetchMySponsoredLeagues(): Promise<SponsoredLeaguePublic[]> {
  const res = await fetch('/api/v1/sponsored-leagues?userId=me', { credentials: 'include' })
  if (!res.ok) throw new Error('Erro ao buscar suas ligas patrocinadas')
  const json = await res.json()
  return json.data ?? []
}

async function joinSponsoredLeague(leagueId: string): Promise<void> {
  const res = await fetch(`/api/v1/sponsored-leagues/${leagueId}/join`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    const msg = json?.error?.message ?? 'Erro ao entrar na liga'
    throw Object.assign(new Error(msg), { code: json?.error?.code })
  }
}

async function leaveSponsoredLeague(leagueId: string): Promise<void> {
  const res = await fetch(`/api/v1/sponsored-leagues/${leagueId}/leave`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    const msg = json?.error?.message ?? 'Erro ao sair da liga'
    throw Object.assign(new Error(msg), { code: json?.error?.code })
  }
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

const STALE_TIME = 60_000

export function useSponsoredLeagues(status = 'ATIVA') {
  return useQuery<SponsoredLeaguePublic[]>({
    queryKey: ['sponsored-leagues', status],
    queryFn: () => fetchSponsoredLeagues(status),
    staleTime: STALE_TIME,
  })
}

export function useMySponsoredLeagues() {
  return useQuery<SponsoredLeaguePublic[]>({
    queryKey: ['my-sponsored-leagues'],
    queryFn: fetchMySponsoredLeagues,
    staleTime: STALE_TIME,
  })
}

export function useJoinSponsoredLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: joinSponsoredLeague,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sponsored-leagues'] })
      qc.invalidateQueries({ queryKey: ['my-sponsored-leagues'] })
    },
  })
}

export function useLeaveSponsoredLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: leaveSponsoredLeague,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sponsored-leagues'] })
      qc.invalidateQueries({ queryKey: ['my-sponsored-leagues'] })
    },
  })
}
