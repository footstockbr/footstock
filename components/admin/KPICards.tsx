'use client'
// ============================================================================
// Foot Stock — KPICards
// 6 cards de KPI do dashboard admin com skeleton loading.
// Rastreabilidade: INT-085, TASK-2/ST003
// ============================================================================

import { Users, TrendingUp, CreditCard, Activity, Server, UserPlus } from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { cn } from '@/lib/utils/cn'
import type { AdminDashboardDTO, MotorStatus } from '@/lib/types/admin'

interface KPICardsProps {
  data: AdminDashboardDTO | null
  isLoading: boolean
  canViewUsers?: boolean
  canViewFinancial?: boolean
  canViewMotor?: boolean
}

function MotorBadge({ status }: { status: MotorStatus }) {
  const map: Record<MotorStatus, { label: string; className: string }> = {
    ONLINE: { label: 'ONLINE', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    OFFLINE: { label: 'OFFLINE', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
    DEGRADED: { label: 'DEGRADED', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  }
  const { label, className } = map[status]
  return (
    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded border', className)}>
      {label}
    </span>
  )
}

const formatBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(n)

export function KPICards({
  data,
  isLoading,
  canViewUsers = true,
  canViewFinancial = true,
  canViewMotor = true,
}: KPICardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {canViewUsers && (
        <StatCard
          label="Usuários Totais"
          value={isLoading ? '—' : String(data?.totalUsers ?? 0)}
          icon={<Users size={16} />}
          isLoading={isLoading}
        />
      )}
      {canViewUsers && (
        <StatCard
          label="Novos Hoje"
          value={isLoading ? '—' : String(data?.newUsers24h ?? 0)}
          icon={<UserPlus size={16} />}
          isLoading={isLoading}
        />
      )}
      {canViewFinancial && (
        <StatCard
          label="Planos Ativos"
          value={isLoading ? '—' : String(data?.activeSubscriptions ?? 0)}
          icon={<CreditCard size={16} />}
          isLoading={isLoading}
        />
      )}
      {canViewFinancial && (
        <StatCard
          label="MRR"
          value={isLoading ? '—' : formatBRL(data?.MRR ?? 0)}
          icon={<TrendingUp size={16} />}
          isLoading={isLoading}
        />
      )}
      <StatCard
        label="Ordens Hoje"
        value={isLoading ? '—' : String(data?.totalOrders24h ?? 0)}
        icon={<Activity size={16} />}
        isLoading={isLoading}
      />
      {canViewMotor && (
        <div
          className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
          aria-label={`Estado do motor: ${data?.motorStatus ?? 'desconhecido'}`}
        >
          <div className="flex items-center gap-2 text-zinc-500">
            <Server size={16} />
            <span className="text-xs uppercase tracking-wide">Motor</span>
          </div>
          <div className="mt-auto">
            {isLoading ? (
              <div className="skeleton h-5 w-20 rounded" aria-hidden="true" />
            ) : (
              <MotorBadge status={data?.motorStatus ?? 'DEGRADED'} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
