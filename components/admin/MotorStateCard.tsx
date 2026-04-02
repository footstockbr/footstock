'use client'
// ============================================================================
// Foot Stock — MotorStateCard
// Estado do motor em tempo real, auto-refresh a cada 15s.
// Rastreabilidade: INT-086, TASK-3/ST005
// ============================================================================

import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Gauge, AlertTriangle, Clock, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { MOTOR_STATUS } from '@/lib/enums'
import { ADMIN_POLL_FAST_MS } from '@/lib/constants/timing'

interface MotorStatusData {
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED'
  leader: string
  lastTick: string | null
  uptime: string | null
  haltedTickers: string[]
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'N/D'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `há ${diff}s`
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`
  return `há ${Math.floor(diff / 3600)}h`
}

const STATUS_STYLES = {
  ONLINE: {
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-500 animate-pulse',
  },
  OFFLINE: {
    badge: 'bg-red-500/20 text-red-400 border-red-500/30',
    dot: 'bg-red-500',
  },
  DEGRADED: {
    badge: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    dot: 'bg-yellow-500 animate-pulse',
  },
}

export function MotorStateCard() {
  const [data, setData] = useState<MotorStatusData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/v1/admin/motor/status')
        if (!res.ok) throw new Error('Failed')
        const json = await res.json()
        setData(json.data)
      } catch (err) {
        Sentry.captureException(err, { tags: { component: 'MotorStateCard' } })
        // Mantém estado anterior em caso de falha
      } finally {
        setIsLoading(false)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, ADMIN_POLL_FAST_MS)
    return () => clearInterval(interval)
  }, [])

  const status = data?.status ?? 'DEGRADED'
  const styles = STATUS_STYLES[status]

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="skeleton mb-3 h-4 w-32 rounded" aria-hidden="true" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-4 w-full rounded" aria-hidden="true" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
      role="status"
      aria-label={`Estado do motor: ${status}`}
    >
      <div className="mb-4 flex items-center gap-2">
        <Gauge size={16} className="text-[#F0B90B]" />
        <h3 className="text-sm font-semibold text-zinc-100">Estado do Motor</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <div className={cn('h-2 w-2 rounded-full', styles.dot)} aria-hidden="true" />
          <span className={cn('rounded border px-1.5 py-0.5 text-xs font-semibold', styles.badge)}>
            {status}
          </span>
        </div>
      </div>

      {status === MOTOR_STATUS.OFFLINE && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-400">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <span>Motor está offline. Verificar Railway dashboard e logs do processo motor.</span>
        </div>
      )}

      <dl className="space-y-2 text-xs">
        <div className="flex items-center justify-between text-zinc-500">
          <dt className="flex items-center gap-1.5">
            <Cpu size={14} /> Líder
          </dt>
          <dd className="font-mono text-[11px] text-zinc-300">{data?.leader ?? 'N/D'}</dd>
        </div>
        <div className="flex items-center justify-between text-zinc-500">
          <dt className="flex items-center gap-1.5">
            <Clock size={14} /> Último tick
          </dt>
          <dd className="text-zinc-300">{formatRelativeTime(data?.lastTick ?? null)}</dd>
        </div>
        <div className="flex items-center justify-between text-zinc-500">
          <dt>Uptime</dt>
          <dd className="text-zinc-300">{data?.uptime ?? 'N/D'}</dd>
        </div>
      </dl>

      {data?.haltedTickers && data.haltedTickers.length > 0 && (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <p className="mb-2 text-xs text-zinc-500">Tickers suspensos:</p>
          <div className="flex flex-wrap gap-1">
            {data.haltedTickers.map(t => (
              <span
                key={t}
                className="rounded border border-red-500/30 bg-red-500/20 px-1.5 py-0.5 font-mono text-[11px] text-red-400"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
