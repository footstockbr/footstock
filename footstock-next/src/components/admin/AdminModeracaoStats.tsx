'use client'

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import type { ModerationStatsDTO } from '@/app/api/v1/admin/moderation/stats/route'

async function fetchModerationStats(): Promise<ModerationStatsDTO> {
  const res = await fetch('/api/v1/admin/moderation/stats', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

function getTimeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return `${secs}s atrás`
  if (secs < 3600) return `${Math.floor(secs / 60)}m atrás`
  return `${Math.floor(secs / 3600)}h atrás`
}

function StatCard({
  label, value, sub, accent, testid,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
  testid: string
}) {
  return (
    <div
      data-testid={testid}
      className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
    >
      <p className="text-[11px] font-medium text-[#929AA5] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-extrabold" style={{ color: accent ?? '#EAECEF' }}>{value}</p>
      {sub && <p className="text-[11px] text-[#929AA5] mt-1">{sub}</p>}
    </div>
  )
}

function LoadingGrid() {
  return (
    <div data-testid="admin-moderacao-stats-loading" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[90px] w-full rounded-xl" />
      ))}
    </div>
  )
}

export function AdminModeracaoStats() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-moderacao-stats'],
    queryFn: fetchModerationStats,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  if (isLoading) return <LoadingGrid />

  if (isError || !data) {
    return (
      <div
        data-testid="admin-moderacao-stats-error"
        className="flex items-center gap-3 p-4 mb-4 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-sm text-[#F6465D]"
      >
        Erro ao carregar métricas de moderação
      </div>
    )
  }

  return (
    <div data-testid="admin-moderacao-stats" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">

      {/* 1. Quantidade de Notícias */}
      <StatCard
        testid="admin-moderacao-kpi-noticias"
        label="Notícias"
        value={data.newsCount.toLocaleString('pt-BR')}
        sub="publicadas e ativas"
      />

      {/* 2. Posts Suspeitos */}
      <StatCard
        testid="admin-moderacao-kpi-suspeitos"
        label="Posts Suspeitos"
        value={data.suspiciousPosts.toLocaleString('pt-BR')}
        sub="aguardando revisão"
        accent={data.suspiciousPosts > 0 ? '#F59E0B' : undefined}
      />

      {/* 3. Posts Moderados */}
      <StatCard
        testid="admin-moderacao-kpi-moderados"
        label="Posts Moderados"
        value={data.moderatedPosts.toLocaleString('pt-BR')}
        sub="posts com ação registrada"
        accent="#2EBD85"
      />

      {/* 4. Posts Excluídos */}
      <StatCard
        testid="admin-moderacao-kpi-excluidos"
        label="Posts Excluídos"
        value={data.deletedPosts.toLocaleString('pt-BR')}
        sub={`atualizado ${getTimeAgo(data.updatedAt)}`}
        accent={data.deletedPosts > 0 ? '#F6465D' : undefined}
      />

    </div>
  )
}
