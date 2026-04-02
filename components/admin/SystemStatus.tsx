'use client'
// ============================================================================
// Foot Stock — SystemStatus
// Dashboard de status dos serviços no painel admin.
// Auto-refresh a cada 30s. Badges coloridos. Mobile-first (48px min).
// Rastreabilidade: INT-110, module-27/TASK-2
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { authedFetch } from '@/lib/api/authed-fetch'
import { Server, Database, Zap, Activity, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { HEALTH_STATUS } from '@/lib/enums'
import { NOTIFICATION_POLL_MS, SYSTEM_COOLDOWN_MS } from '@/lib/constants/timing'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type ServiceDetailedStatus = 'ok' | 'degraded' | 'error'

interface ServiceComponent {
  status: ServiceDetailedStatus
  latencyMs?: number
  message?: string
}

interface HealthDetailedResponse {
  status: string
  components: {
    api: ServiceComponent
    db: ServiceComponent
    redis: ServiceComponent
    motor: ServiceComponent
  }
  uptime: number
  nodeVersion: string
  timestamp: string
}

// ---------------------------------------------------------------------------
// Constantes de serviço
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<ServiceDetailedStatus, string> = {
  ok: 'Operacional',
  degraded: 'Degradado',
  error: 'Indisponível',
}

const STATUS_BADGE_VARIANT: Record<ServiceDetailedStatus, 'success' | 'warning' | 'error'> = {
  ok: 'success',
  degraded: 'warning',
  error: 'error',
}

const SERVICES = [
  { key: 'api' as const, label: 'API', Icon: Server },
  { key: 'db' as const, label: 'Banco de Dados', Icon: Database },
  { key: 'redis' as const, label: 'Redis (Cache)', Icon: Zap },
  { key: 'motor' as const, label: 'Motor de Mercado', Icon: Activity },
]

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface SystemStatusProps {
  className?: string
}

export function SystemStatus({ className }: SystemStatusProps) {
  const [data, setData] = useState<HealthDetailedResponse | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [secondsSince, setSecondsSince] = useState(0)
  const [cooldown, setCooldown] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async (manual = false) => {
    if (manual) setIsRefreshing(true)
    try {
      const res = await authedFetch('/api/v1/health/detailed', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: HealthDetailedResponse = await res.json()
      setData(json)
      setError(false)
      setLastUpdated(new Date())
      setSecondsSince(0)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
      if (manual) setIsRefreshing(false)
    }
  }, [])

  // Auto-refresh a cada 30s (pausar quando tab inativa)
  useEffect(() => {
    fetchStatus()

    const start = () => {
      intervalRef.current = setInterval(() => fetchStatus(), NOTIFICATION_POLL_MS)
    }
    const stop = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchStatus()
        start()
      } else {
        stop()
      }
    }

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchStatus])

  // Ticker "há X segundos"
  useEffect(() => {
    tickRef.current = setInterval(() => {
      setSecondsSince(s => s + 1)
    }, 1000)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [])

  const handleRefresh = async () => {
    if (cooldown || isRefreshing) return
    setCooldown(true)
    await fetchStatus(true)
    setTimeout(() => setCooldown(false), SYSTEM_COOLDOWN_MS)
  }

  const motorOffline =
    data?.components.motor.status === HEALTH_STATUS.ERROR && !loading && !error

  const uptimeUrl = process.env.NEXT_PUBLIC_UPTIME_MONITOR_URL

  // ---------------------------------------------------------------------------
  // Loading skeleton
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div
        data-testid="system-status"
        className={cn('space-y-4', className)}
        aria-label="Verificando status dos serviços"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-bg-elevated animate-pulse"
              role="status"
              aria-label="Carregando"
            />
          ))}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------
  if (error && !data) {
    return (
      <div data-testid="system-status" className={cn('space-y-4', className)}>
        <div
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 flex items-center gap-3"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>Erro ao verificar status dos serviços</span>
          <button
            onClick={handleRefresh}
            data-testid="system-status-refresh-btn"
            className="ml-auto rounded-lg px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 transition-colors min-h-[44px]"
            aria-label="Tentar novamente"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div data-testid="system-status" className={cn('space-y-4', className)}>
      {/* Banner motor offline */}
      {motorOffline && (
        <div
          data-testid="motor-offline-banner"
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400 flex items-center gap-3"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">
            Alerta: Motor de mercado indisponível
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-text-primary">
          <Server className="h-5 w-5 text-text-secondary" />
          <h2 className="text-base font-semibold">Status do Sistema</h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Timestamp */}
          <span
            data-testid="system-status-timestamp"
            className="text-xs text-text-tertiary"
            aria-live="polite"
          >
            {error
              ? 'Última verificação falhou'
              : lastUpdated
                ? `Atualizado há ${secondsSince}s`
                : 'Verificando...'}
          </span>

          {/* Btn verificar agora */}
          <button
            onClick={handleRefresh}
            disabled={cooldown || isRefreshing}
            data-testid="system-status-refresh-btn"
            aria-label="Verificar status dos serviços"
            className={cn(
              'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[48px]',
              'bg-bg-elevated hover:bg-bg-elevated/80 text-text-primary border border-border-default',
              'focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2 focus:ring-offset-[#080808]',
              (cooldown || isRefreshing) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            Verificar Agora
          </button>
        </div>
      </div>

      {/* Grid de cards de serviço */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SERVICES.map(({ key, label, Icon }) => {
          const component = data?.components[key]
          const status: ServiceDetailedStatus = component?.status ?? 'error'
          const latency = component?.latencyMs

          return (
            <Card
              key={key}
              data-testid={`service-card-${key}`}
              role="status"
              tabIndex={0}
              aria-label={`${label}: ${STATUS_LABEL[status]}${latency !== undefined && latency >= 0 ? `, latência ${latency}ms` : ''}`}
              className={cn(
                'flex items-center gap-4 p-4 min-h-[48px]',
                'focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:ring-offset-2 focus:ring-offset-[#080808]',
                status === HEALTH_STATUS.ERROR && 'border-red-500/20',
                status === HEALTH_STATUS.DEGRADED && 'border-amber-500/20'
              )}
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  status === HEALTH_STATUS.OK && 'bg-emerald-500/10',
                  status === HEALTH_STATUS.DEGRADED && 'bg-amber-500/10',
                  status === HEALTH_STATUS.ERROR && 'bg-red-500/10'
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5',
                    status === HEALTH_STATUS.OK && 'text-emerald-400',
                    status === HEALTH_STATUS.DEGRADED && 'text-amber-400',
                    status === HEALTH_STATUS.ERROR && 'text-red-400'
                  )}
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary truncate">{label}</p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  {latency !== undefined && latency >= 0 ? `${latency}ms` : '-'}
                </p>
              </div>

              <Badge
                data-testid={`status-badge-${key}`}
                variant={STATUS_BADGE_VARIANT[status]}
                aria-live="polite"
              >
                {STATUS_LABEL[status]}
              </Badge>
            </Card>
          )
        })}
      </div>

      {/* Footer */}
      {uptimeUrl && (
        <div className="flex items-center justify-end">
          <a
            href={uptimeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver histórico de uptime
          </a>
        </div>
      )}

      {/* Dados desatualizados */}
      {error && data && (
        <p className="text-xs text-amber-400 text-center" aria-live="polite">
          Dados desatualizados — última verificação falhou
        </p>
      )}
    </div>
  )
}
