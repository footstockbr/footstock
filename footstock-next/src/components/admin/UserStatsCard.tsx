'use client'

import { Users, ShieldOff, AlertTriangle, Circle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { AdminDashboardDTO } from '@/lib/types/admin'

interface UserStatsCardProps {
  data: AdminDashboardDTO | null
  isLoading: boolean
}

const PLAN_META: Record<string, { label: string; color: string }> = {
  LENDA:   { label: 'Lenda',   color: '#F0B90B' },
  CRAQUE:  { label: 'Craque',  color: '#6c63ff' },
  JOGADOR: { label: 'Jogador', color: '#929AA5' },
}

const ABSENCE_PERIODS = [
  { key: 'd1',      label: '1 dia',   color: '#f97316' },
  { key: 'd7',      label: '7 dias',  color: '#f97316' },
  { key: 'd15',     label: '15 dias', color: '#F6465D' },
  { key: 'd30',     label: '30 dias', color: '#F6465D' },
  { key: 'd30plus', label: '+30d',    color: 'rgba(246,70,93,.55)' },
] as const

export function UserStatsCard({ data, isLoading }: UserStatsCardProps) {
  const stats = data?.userStats
  const totalUsers = data?.totalUsers ?? 0

  if (isLoading) {
    return (
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-4 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 rounded" />
          ))}
        </div>
        <Skeleton className="h-4 w-36" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 flex-1 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-[#F0B90B]" />
        <h3 className="text-xs font-bold text-[#929AA5] uppercase tracking-wider">Usuários</h3>
      </div>

      {/* KPI grid: total, online, suspensos, posts suspeitos */}
      <div className="grid grid-cols-2 gap-2">
        {/* Total cadastrados */}
        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Total Cadastrados</p>
          <p className="text-2xl font-extrabold font-mono text-white leading-none">{totalUsers.toLocaleString('pt-BR')}</p>
          {stats && (
            <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#2EBD85' }}>
              <Circle className="h-2 w-2 fill-[#2EBD85]" />
              {stats.online} online agora
            </p>
          )}
        </div>

        {/* Inativos */}
        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Inativos × Total</p>
          <p className="text-2xl font-extrabold font-mono leading-none" style={{ color: '#f97316' }}>
            {stats ? stats.inactiveByPeriod.d30.toLocaleString('pt-BR') : '—'}
          </p>
          <p className="text-[10px] text-[#929AA5] mt-1">
            de {totalUsers} ({totalUsers > 0 && stats
              ? Math.round((stats.inactiveByPeriod.d30 / totalUsers) * 100)
              : 0}% do total)
          </p>
        </div>

        {/* Suspensos */}
        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Suspensos</p>
          <p
            className="text-2xl font-extrabold font-mono leading-none"
            style={{ color: stats && stats.suspended > 0 ? '#F6465D' : '#2EBD85' }}
          >
            {stats?.suspended ?? '—'}
          </p>
          <p className="text-[10px] text-[#929AA5] mt-1">contas bloqueadas</p>
        </div>

        {/* Posts suspeitos */}
        <div className="bg-[#181A20] rounded-lg p-3">
          <p className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Posts Suspeitos</p>
          <p
            className="text-2xl font-extrabold font-mono leading-none"
            style={{ color: stats && stats.postsPendingModeration > 0 ? '#f97316' : '#2EBD85' }}
          >
            {stats?.postsPendingModeration ?? '—'}
          </p>
          <p className="text-[10px] text-[#929AA5] mt-1">aguardando moderação</p>
        </div>
      </div>

      {/* Distribuição de planos */}
      {stats && (
        <div>
          <p className="text-[10px] font-bold text-[#929AA5] uppercase tracking-wider mb-3">
            Distribuição de Planos
          </p>
          <div className="space-y-2.5">
            {stats.planDistribution.map(({ plan, count, pct }) => {
              const meta = PLAN_META[plan] ?? { label: plan, color: '#929AA5' }
              return (
                <div key={plan}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-bold" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="text-[11px] font-mono font-bold" style={{ color: meta.color }}>
                      {count.toLocaleString('pt-BR')} ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#2B2F36] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, background: meta.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ausência por período */}
      {stats && (
        <div>
          <p className="text-[10px] font-bold text-[#929AA5] uppercase tracking-wider mb-2">
            Ausência por Período
          </p>
          <div className="flex gap-1.5">
            {ABSENCE_PERIODS.map(({ key, label, color }) => {
              const value = stats.inactiveByPeriod[key]
              return (
                <div
                  key={key}
                  className="flex-1 bg-[#181A20] rounded-lg py-2 px-1 text-center"
                >
                  <p className="text-base font-extrabold font-mono leading-none" style={{ color }}>
                    {value.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[8px] text-[#929AA5] mt-1 leading-tight">{label}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Indicadores de ação rápida */}
      {stats && (stats.suspended > 0 || stats.postsPendingModeration > 0) && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-[rgba(240,185,11,.08)]">
          {stats.suspended > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-[rgba(246,70,93,.1)] text-[#F6465D] border border-[rgba(246,70,93,.2)]">
              <ShieldOff className="h-3 w-3" />
              {stats.suspended} suspenso{stats.suspended !== 1 ? 's' : ''}
            </span>
          )}
          {stats.postsPendingModeration > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-[rgba(249,115,22,.1)] text-[#f97316] border border-[rgba(249,115,22,.2)]">
              <AlertTriangle className="h-3 w-3" />
              {stats.postsPendingModeration} post{stats.postsPendingModeration !== 1 ? 's' : ''} pendente{stats.postsPendingModeration !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
