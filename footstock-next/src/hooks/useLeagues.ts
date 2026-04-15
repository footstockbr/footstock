'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { League, LeagueMemberRanking, LeagueType } from '@/types'

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchLeagues(type?: LeagueType): Promise<League[]> {
  const q = type ? `?type=${type}` : ''
  const res = await fetch(`/api/v1/leagues${q}`)
  if (!res.ok) throw new Error('Erro ao buscar ligas')
  const json = await res.json()
  return json.data ?? []
}

async function fetchLeague(id: string): Promise<League & { members: unknown[] }> {
  const res = await fetch(`/api/v1/leagues/${id}`)
  if (!res.ok) throw new Error('Liga não encontrada')
  const json = await res.json()
  return json.data
}

async function fetchRanking(id: string): Promise<LeagueMemberRanking[]> {
  const res = await fetch(`/api/v1/leagues/${id}/ranking`)
  if (!res.ok) throw new Error('Erro ao buscar ranking')
  const json = await res.json()
  return json.data ?? []
}

async function fetchMyLeagues(): Promise<League[]> {
  const res = await fetch('/api/v1/leagues?userId=me')
  if (!res.ok) throw new Error('Erro ao buscar suas ligas')
  const json = await res.json()
  return json.data ?? []
}

async function joinLeague(leagueId: string): Promise<void> {
  const res = await fetch(`/api/v1/leagues/${leagueId}/join`, { method: 'POST' })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    const msg = json?.error?.message ?? 'Erro ao entrar na liga'
    throw Object.assign(new Error(msg), { code: json?.error?.code })
  }
}

async function generateInvite(leagueId: string): Promise<{ inviteUrl: string }> {
  const res = await fetch(`/api/v1/leagues/${leagueId}/invite`, { method: 'POST' })
  if (!res.ok) throw new Error('Erro ao gerar convite')
  const json = await res.json()
  return json.data
}

async function revokeInvite(leagueId: string): Promise<void> {
  const res = await fetch(`/api/v1/leagues/${leagueId}/invite`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Erro ao revogar convite')
}

interface P2EventItem {
  eventType: string
  points: number
  period: string
}

interface MyScoreData {
  breakdown: Record<string, number>
  scoreTotal: number
  rank: number
  lastScoreAt: string
  history: { date: string; rank: number; score: number }[]
  p2Events: P2EventItem[]
}

async function fetchMyScore(leagueId: string): Promise<MyScoreData> {
  const res = await fetch(`/api/v1/leagues/${leagueId}/my-score`)
  if (!res.ok) throw new Error('Erro ao buscar score')
  const json = await res.json()
  return json.data
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const STALE_TIME = 60_000 // 60s

export function useLeagues(type?: LeagueType) {
  return useQuery<League[]>({
    queryKey: ['leagues', type ?? 'ALL'],
    queryFn: () => fetchLeagues(type),
    staleTime: STALE_TIME,
  })
}

export function useLeagueDetail(id: string) {
  return useQuery({
    queryKey: ['league', id],
    queryFn: () => fetchLeague(id),
    staleTime: STALE_TIME,
    enabled: !!id,
  })
}

export function useLeagueRanking(id: string) {
  return useQuery<LeagueMemberRanking[]>({
    queryKey: ['league-ranking', id],
    queryFn: () => fetchRanking(id),
    staleTime: STALE_TIME,
    enabled: !!id,
  })
}

export function useMyLeagues() {
  return useQuery<League[]>({
    queryKey: ['my-leagues'],
    queryFn: fetchMyLeagues,
    staleTime: STALE_TIME,
  })
}

export function useJoinLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: joinLeague,
    onSuccess: (_, leagueId) => {
      qc.invalidateQueries({ queryKey: ['leagues'] })
      qc.invalidateQueries({ queryKey: ['my-leagues'] })
      qc.invalidateQueries({ queryKey: ['league', leagueId] })
    },
  })
}

export function useGenerateInvite() {
  return useMutation({
    mutationFn: generateInvite,
  })
}

export function useRevokeInvite() {
  return useMutation({
    mutationFn: revokeInvite,
  })
}

export function useMyScore(leagueId: string) {
  return useQuery({
    queryKey: ['league-my-score', leagueId],
    queryFn: () => fetchMyScore(leagueId),
    staleTime: 5 * 60 * 1000, // 5 min
    enabled: !!leagueId,
  })
}
