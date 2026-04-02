'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import type { League, LeagueMemberRanking, LeagueType } from '@/types'
import { queryKeys } from '@/lib/constants/query-keys'

// ─── Fetchers (via apiClient compartilhado) ──────────────────────────────────

async function fetchLeagues(type?: LeagueType): Promise<League[]> {
  const q = type ? `?type=${type}` : ''
  const { data } = await apiClient.get(`/api/v1/leagues${q}`)
  return data.data ?? []
}

async function fetchLeague(id: string): Promise<League & { members: unknown[] }> {
  const { data } = await apiClient.get(`/api/v1/leagues/${id}`)
  return data.data
}

async function fetchRanking(id: string): Promise<LeagueMemberRanking[]> {
  const { data } = await apiClient.get(`/api/v1/leagues/${id}/ranking`)
  return data.data ?? []
}

async function fetchMyLeagues(): Promise<League[]> {
  const { data } = await apiClient.get('/api/v1/leagues?userId=me')
  return data.data ?? []
}

async function joinLeague(leagueId: string): Promise<void> {
  await apiClient.post(`/api/v1/leagues/${leagueId}/join`)
}

async function generateInvite(leagueId: string): Promise<{ inviteUrl: string }> {
  const { data } = await apiClient.post(`/api/v1/leagues/${leagueId}/invite`)
  return data.data
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

const STALE_TIME = 60_000 // 60s

export function useLeagues(type?: LeagueType) {
  return useQuery<League[]>({
    queryKey: queryKeys.leagues.list(type),
    queryFn: () => fetchLeagues(type),
    staleTime: STALE_TIME,
  })
}

export function useLeagueDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.leagues.detail(id),
    queryFn: () => fetchLeague(id),
    staleTime: STALE_TIME,
    enabled: !!id,
  })
}

export function useLeagueRanking(id: string) {
  return useQuery<LeagueMemberRanking[]>({
    queryKey: queryKeys.leagues.ranking(id),
    queryFn: () => fetchRanking(id),
    staleTime: STALE_TIME,
    enabled: !!id,
  })
}

export function useMyLeagues() {
  return useQuery<League[]>({
    queryKey: queryKeys.leagues.myLeagues,
    queryFn: fetchMyLeagues,
    staleTime: STALE_TIME,
  })
}

export function useJoinLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: joinLeague,
    onSuccess: (_, leagueId) => {
      qc.invalidateQueries({ queryKey: queryKeys.leagues.all })
      qc.invalidateQueries({ queryKey: queryKeys.leagues.myLeagues })
      qc.invalidateQueries({ queryKey: queryKeys.leagues.detail(leagueId) })
    },
    onError: () => {},
  })
}

export function useGenerateInvite() {
  return useMutation({
    mutationFn: generateInvite,
    onSuccess: () => {},
    onError: () => {},
  })
}

export function useCreateLeague() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createLeagueApi,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.leagues.all })
      qc.invalidateQueries({ queryKey: queryKeys.leagues.myLeagues })
    },
    onError: () => {},
  })
}

async function createLeagueApi(data: { name: string; type: string; division: string; duration: string }): Promise<{ id: string }> {
  const { data: resp } = await apiClient.post('/api/v1/leagues', data)
  return resp.data
}
