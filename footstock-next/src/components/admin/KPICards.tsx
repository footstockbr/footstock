import { Server, UserPlus } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-card'
import { cn } from '@/lib/utils'
import type { AdminDashboardDTO } from '@/lib/types/admin'

interface KPICardsProps {
  data: AdminDashboardDTO | null
  isLoading: boolean
}

function MotorBadge({ status }: { status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' }) {
  const map = {
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

export function KPICards({ data, isLoading }: KPICardsProps) {
  return (
    <>
      {/* Novos Hoje */}
      <div data-testid="admin-kpi-card-novos-hoje" className="h-full">
        <StatCard
          label="Novos Hoje"
          value={isLoading ? '—' : String(data?.newUsers24h ?? 0)}
          icon={<UserPlus className="h-4 w-4" />}
          isLoading={isLoading}
          aria-label="Novos usuários nas últimas 24 horas"
          className="h-full"
        />
      </div>

      {/* Motor status */}
      <div
        data-testid="admin-kpi-card-motor"
        className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4 flex flex-col gap-2"
        aria-label={`Estado do motor: ${data?.motorStatus ?? 'desconhecido'}`}
      >
        <div className="flex items-center gap-2 text-[#929AA5]">
          <Server className="h-4 w-4" />
          <span className="text-xs">Motor</span>
        </div>
        <div className="mt-auto">
          {isLoading ? (
            <div className="h-5 w-20 bg-[rgba(240,185,11,.08)] rounded animate-pulse" />
          ) : (
            <MotorBadge status={data?.motorStatus ?? 'DEGRADED'} />
          )}
        </div>
      </div>
    </>
  )
}
