'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { MotorStateCard } from '@/components/admin/MotorStateCard'
import { ClubEditor } from '@/components/admin/ClubEditor'
import { NewsInjector } from '@/components/admin/NewsInjector'
import { ImpactMatrix } from '@/components/admin/ImpactMatrix'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { hasAdminRole } from '@/lib/utils/admin-roles'
import type { AdminMarketActionLog } from '@/lib/types/admin'
import type { AdminRole } from '@/types'

interface MotorKpis {
  circuitBreakers: number
  aggregatePnl: number
}

async function fetchAuditLog(): Promise<AdminMarketActionLog[]> {
  const res = await fetch('/api/v1/admin/audit?limit=20')
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

async function fetchMotorKpis(): Promise<MotorKpis> {
  const res = await fetch('/api/v1/admin/motor/kpis', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

const ACTION_BADGE: Record<string, string> = {
  HALT_ASSET: 'bg-red-500/20 text-red-400',
  RELEASE_HALT: 'bg-emerald-500/20 text-emerald-400',
  NEWS_INJECT: 'bg-blue-500/20 text-blue-400',
  UNAUTHORIZED_ATTEMPT: 'bg-yellow-500/20 text-yellow-400',
  ADMIN_BROADCAST: 'bg-purple-500/20 text-purple-400',
}

type MotorTab = 'estado' | 'noticias' | 'matriz'

const TABS: { id: MotorTab; label: string }[] = [
  { id: 'estado', label: 'Estado Ao Vivo' },
  { id: 'noticias', label: 'Disparar Notícia' },
  { id: 'matriz', label: 'Matriz de Impacto' },
]

function AuditLog() {
  const { data: actions, isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: fetchAuditLog,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <h2 className="text-sm font-semibold text-[#EAECEF] mb-3">Ações Recentes</h2>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : !actions?.length ? (
        <p className="text-xs text-[#929AA5] py-4 text-center">Nenhuma ação registrada ainda</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="text-[#929AA5] border-b border-[rgba(240,185,11,.08)]">
                <th className="text-left py-1.5 px-2 font-medium">Data/Hora</th>
                <th className="text-left py-1.5 px-2 font-medium">Admin</th>
                <th className="text-left py-1.5 px-2 font-medium">Ação</th>
                <th className="text-left py-1.5 px-2 font-medium">Ticker</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className="border-b border-[rgba(240,185,11,.06)] last:border-0">
                  <td className="py-2 px-2 text-[#929AA5]">
                    {new Date(a.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="py-2 px-2 text-[#c5b99a]">{a.adminName ?? a.adminId.slice(0, 8)}</td>
                  <td className="py-2 px-2">
                    <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded', ACTION_BADGE[a.action] ?? 'bg-zinc-700/40 text-zinc-400')}>
                      {a.action}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-[#929AA5]">{a.targetTicker ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface MotorPageClientProps {
  adminRole: AdminRole
}

export default function MotorPageClient({ adminRole }: MotorPageClientProps) {
  const [activeTab, setActiveTab] = useState<MotorTab>('estado')
  const canHalt = hasAdminRole(adminRole, 'MODERADOR')

  const { data: kpis, isLoading: kpisLoading } = useQuery({
    queryKey: ['motor-kpis'],
    queryFn: fetchMotorKpis,
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const pnlFormatted = kpis
    ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(kpis.aggregatePnl))
    : '—'
  const pnlIsNegative = (kpis?.aggregatePnl ?? 0) < 0
  const pnlColor = pnlIsNegative ? '#F6465D' : '#2EBD85'
  const pnlSign = pnlIsNegative ? '-' : ''

  return (
    <div className="p-4 md:p-6 space-y-5">
      <AdminBreadcrumb />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF]">Motor de Mercado</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Controles, estado ao vivo e configuração</p>
        </div>
        {canHalt && (
          <button className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#1E2329] text-[#F6465D] border border-[rgba(246,70,93,.2)] hover:border-[rgba(246,70,93,.4)] transition-all whitespace-nowrap">
            ⏸ Pausar
          </button>
        )}
      </div>

      {/* KPIs — dados reais */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <div className="text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">P&L Agregado</div>
          {kpisLoading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <div className="text-lg font-extrabold" style={{ color: pnlColor }}>
              {pnlSign}FS${pnlFormatted}
            </div>
          )}
          <div className="text-[10px] text-[#929AA5] mt-1">soma de todas as carteiras abertas</div>
        </div>

        <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-[#929AA5] uppercase tracking-wide">Circuit Breakers</div>
            <span>🔒</span>
          </div>
          {kpisLoading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <div
              className="text-lg font-extrabold"
              style={{ color: (kpis?.circuitBreakers ?? 0) > 0 ? '#F6465D' : '#2EBD85' }}
            >
              {kpis?.circuitBreakers ?? 0}
            </div>
          )}
          <div className="text-[10px] text-[#929AA5] mt-1">
            {(kpis?.circuitBreakers ?? 0) === 0 ? 'nenhum ativo suspenso' : 'ativos com negociação suspensa'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all',
              activeTab === tab.id
                ? 'bg-[#F0B90B] text-[#080b12]'
                : 'bg-[#1E2329] text-[#929AA5] border border-[rgba(240,185,11,.1)] hover:border-[rgba(240,185,11,.3)]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'estado' && (
        <div className="space-y-4">
          <MotorStateCard />
          <ClubEditor canHalt={canHalt} />
          <AuditLog />
        </div>
      )}

      {activeTab === 'noticias' && (
        <div className="space-y-4">
          <NewsInjector />
          <AuditLog />
        </div>
      )}

      {activeTab === 'matriz' && (
        <div className="space-y-4">
          <ImpactMatrix />
          <AuditLog />
        </div>
      )}
    </div>
  )
}
