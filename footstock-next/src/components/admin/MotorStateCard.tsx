'use client'

import { useQuery } from '@tanstack/react-query'
import { Gauge, AlertTriangle, Clock, Cpu } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface MotorStatusData {
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED'
  leader: string
  lastTick: string | null
  uptime: string | null
  haltedTickers: string[]
}

async function fetchMotorStatus(): Promise<MotorStatusData> {
  const res = await fetch('/api/v1/admin/motor/status')
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'N/D'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `há ${diff}s`
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`
  return `há ${Math.floor(diff / 3600)}h`
}

const STATUS_STYLES = {
  ONLINE: { badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-500 animate-pulse' },
  OFFLINE: { badge: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-500' },
  DEGRADED: { badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-500 animate-pulse' },
}

export function MotorStateCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['motor-status'],
    queryFn: fetchMotorStatus,
    refetchInterval: 15_000,
    retry: 2,
  })

  if (isLoading) {
    return (
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
        <Skeleton className="h-4 w-32 mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    )
  }

  const status = data?.status ?? 'DEGRADED'
  const styles = STATUS_STYLES[status]

  return (
    <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="h-4 w-4 text-[#F0B90B]" />
        <h2 className="text-sm font-semibold text-[#EAECEF]">Estado do Motor</h2>
        <div className="ml-auto flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', styles.dot)} />
          <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded border', styles.badge)}>
            {status}
          </span>
        </div>
      </div>

      {status === 'OFFLINE' && (
        <div className="flex items-start gap-2 bg-red-500/10 text-red-400 rounded-lg p-3 text-xs mb-3">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>Motor está offline. Verificar Railway dashboard e logs do processo motor.</span>
        </div>
      )}

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between text-[#929AA5]">
          <span className="flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5" /> Líder
          </span>
          <span className="text-[#c5b99a] font-mono text-[11px]">{data?.leader ?? 'N/D'}</span>
        </div>
        <div className="flex items-center justify-between text-[#929AA5]">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Último tick
          </span>
          <span className="text-[#c5b99a]">{formatRelativeTime(data?.lastTick ?? null)}</span>
        </div>
        <div className="flex items-center justify-between text-[#929AA5]">
          <span>Uptime</span>
          <span className="text-[#c5b99a]">{data?.uptime ?? 'N/D'}</span>
        </div>
      </div>

      {data?.haltedTickers && data.haltedTickers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[rgba(240,185,11,.08)]">
          <p className="text-xs text-[#929AA5] mb-2">Tickers halted:</p>
          <div className="flex flex-wrap gap-1">
            {data.haltedTickers.map((t) => (
              <span key={t} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
