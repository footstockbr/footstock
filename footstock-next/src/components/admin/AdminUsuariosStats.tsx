'use client'

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ui/skeleton'
import type { UserStatsDTO } from '@/app/api/v1/admin/users/stats/route'

async function fetchUserStats(): Promise<UserStatsDTO> {
  const res = await fetch('/api/v1/admin/users/stats', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

const PLAN_COLORS: Record<string, string> = {
  JOGADOR: '#929AA5',
  CRAQUE: '#F0B90B',
  LENDA: '#FCD535',
}

const PLAN_LABELS: Record<string, string> = {
  JOGADOR: 'Jogador',
  CRAQUE: 'Craque',
  LENDA: 'Lenda',
}

function StatCard({ label, value, sub, testid }: {
  label: string
  value: string | number
  sub?: string
  testid: string
}) {
  return (
    <div
      data-testid={testid}
      className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
    >
      <p className="text-[11px] font-medium text-[#929AA5] uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-[#EAECEF]">{value}</p>
      {sub && <p className="text-[11px] text-[#929AA5] mt-1">{sub}</p>}
    </div>
  )
}

function LoadingGrid() {
  return (
    <div data-testid="admin-usuarios-stats-loading" className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[90px] w-full rounded-xl" />
      ))}
    </div>
  )
}

export function AdminUsuariosStats() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-usuarios-stats'],
    queryFn: fetchUserStats,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  if (isLoading) return <LoadingGrid />

  if (isError || !data) {
    return (
      <div
        data-testid="admin-usuarios-stats-error"
        className="flex items-center gap-3 p-4 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-sm text-[#F6465D]"
      >
        Erro ao carregar métricas de usuários
      </div>
    )
  }

  return (
    <div data-testid="admin-usuarios-stats" className="grid grid-cols-2 md:grid-cols-3 gap-3">

      {/* 1. Usuários Totais */}
      <StatCard
        testid="admin-usuarios-kpi-total"
        label="Usuários Totais"
        value={data.totalUsers.toLocaleString('pt-BR')}
        sub="cadastrados na plataforma"
      />

      {/* 2. Novos Hoje */}
      <StatCard
        testid="admin-usuarios-kpi-novos-hoje"
        label="Novos Hoje"
        value={data.newUsersToday}
        sub="últimas 24 horas"
      />

      {/* 3. Planos Ativos */}
      <StatCard
        testid="admin-usuarios-kpi-planos-ativos"
        label="Planos Ativos"
        value={data.activeSubscriptions.toLocaleString('pt-BR')}
        sub="assinaturas com status ACTIVE"
      />

      {/* 4. Distribuição de Planos */}
      <div
        data-testid="admin-usuarios-kpi-distribuicao-planos"
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
      >
        <p className="text-[11px] font-medium text-[#929AA5] uppercase tracking-wide mb-2">
          Distribuição de Planos
        </p>
        <div className="space-y-2">
          {data.planDistribution.map(({ plan, count, pct }) => (
            <div key={plan} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: PLAN_COLORS[plan] ?? '#929AA5' }} />
              <span className="text-[11px] text-[#929AA5] w-14 flex-shrink-0">
                {PLAN_LABELS[plan] ?? plan}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[#2B3139] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: PLAN_COLORS[plan] ?? '#929AA5' }}
                />
              </div>
              <span className="text-[11px] font-mono text-[#EAECEF] w-8 text-right flex-shrink-0">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Ausência por período */}
      <div
        data-testid="admin-usuarios-kpi-ausencia"
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4"
      >
        <p className="text-[11px] font-medium text-[#929AA5] uppercase tracking-wide mb-2">
          Ausência por Período
        </p>
        <div className="space-y-1.5">
          {([
            { label: '+7 dias sem operar',  value: data.inactiveByPeriod.d7 },
            { label: '+15 dias sem operar', value: data.inactiveByPeriod.d15 },
            { label: '+30 dias sem operar', value: data.inactiveByPeriod.d30 },
          ] as const).map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[11px] text-[#929AA5]">{label}</span>
              <span className="text-[12px] font-semibold text-[#EAECEF]">
                {value.toLocaleString('pt-BR')}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[#707A8A] mt-2">proxy via ausência de ordens</p>
      </div>

      {/* 6. Ordens Hoje */}
      <StatCard
        testid="admin-usuarios-kpi-ordens-hoje"
        label="Ordens Hoje"
        value={data.ordersToday.toLocaleString('pt-BR')}
        sub="ordens FILLED nas últimas 24h"
      />

    </div>
  )
}
