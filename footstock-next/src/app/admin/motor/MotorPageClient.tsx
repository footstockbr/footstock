'use client'

import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AdminBreadcrumb } from '@/components/admin/AdminBreadcrumb'
import { MotorStateCard } from '@/components/admin/MotorStateCard'
import { ClubEditor } from '@/components/admin/ClubEditor'
import { NewsInjector } from '@/components/admin/NewsInjector'
import { ImpactMatrix } from '@/components/admin/ImpactMatrix'
import { MotorCamadas } from '@/components/admin/MotorCamadas'
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
  const res = await fetch('/api/v1/admin/audit?limit=20', { credentials: 'include' })
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

interface CircuitBreakerConfigView {
  enabled: boolean
  thresholdPct: number
  halt_trigger: number
  halt_duration_s: number
  source?: string
  updatedAt?: string | null
}

async function fetchCircuitBreakerConfig(): Promise<CircuitBreakerConfigView> {
  const res = await fetch('/api/v1/admin/motor/circuit-breaker', { credentials: 'include' })
  if (!res.ok) throw new Error('Failed')
  const { data } = await res.json()
  return data
}

// Controle do circuit breaker dentro do card de KPI: toggle on/off (aplica na hora) +
// input do limiar em % com submit. Persiste no SSoT motor:layers:config:v1 via
// /api/v1/admin/motor/circuit-breaker; o motor lê o mesmo blob (cache ~10s).
function CircuitBreakerControl() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['motor-cb-config'],
    queryFn: fetchCircuitBreakerConfig,
    staleTime: 60_000,
  })

  // pctDraft = null => segue o servidor; string => edição local em curso.
  const [pctDraft, setPctDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (payload: { enabled?: boolean; thresholdPct?: number }) => {
      const res = await fetch('/api/v1/admin/motor/circuit-breaker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? 'Falha ao salvar circuit breaker')
      return json.data as CircuitBreakerConfigView
    },
    // Toggle otimista: a chave se move na hora; reverte no onError.
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['motor-cb-config'] })
      const prev = queryClient.getQueryData<CircuitBreakerConfigView>(['motor-cb-config'])
      if (payload.enabled !== undefined && prev) {
        queryClient.setQueryData<CircuitBreakerConfigView>(['motor-cb-config'], {
          ...prev,
          enabled: payload.enabled,
        })
      }
      return { prev }
    },
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['motor-cb-config'] })
      queryClient.invalidateQueries({ queryKey: ['motor-kpis'] })
      // Camadas lê o MESMO blob (motor:layers:config:v1) — refresca para refletir a mudança.
      queryClient.invalidateQueries({ queryKey: ['motor-layers'] })
    },
    onError: (e: Error, _payload, context) => {
      if (context?.prev) queryClient.setQueryData(['motor-cb-config'], context.prev)
      setError(e.message)
    },
  })

  if (isLoading) {
    return <Skeleton className="h-16 w-full" data-testid="admin-motor-cb-loading" />
  }

  // Zero Silêncio: falha de leitura não pode virar skeleton infinito mudo.
  if (isError || !data) {
    return (
      <div data-testid="admin-motor-cb-error-load" className="flex items-center justify-between gap-2">
        <span className="text-[10px] text-[#F6465D]">Falha ao carregar o circuit breaker.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-2 py-1 rounded text-[10px] font-semibold border border-[rgba(240,185,11,.3)] text-[#F0B90B]"
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  const enabled = data.enabled
  const shownPct = pctDraft ?? String(data.thresholdPct)
  const pctNum = Number(shownPct)
  const pctValid = Number.isFinite(pctNum) && pctNum >= 1 && pctNum <= 50
  const pctDirty = pctDraft !== null && pctNum !== data.thresholdPct

  function submitThreshold() {
    if (!pctValid) {
      setError('Limiar deve ser entre 1% e 50%')
      return
    }
    mutation.mutate({ thresholdPct: pctNum }, { onSuccess: () => setPctDraft(null) })
  }

  return (
    <div data-testid="admin-motor-cb-control" className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#929AA5] uppercase tracking-wide">Halt automático</span>
        <button
          type="button"
          data-testid="admin-motor-cb-toggle"
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? 'Desligar circuit breaker' : 'Ligar circuit breaker'}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ enabled: !enabled })}
          className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50"
          style={{ background: enabled ? '#2EBD85' : '#5E6673' }}
        >
          <span
            className="inline-block h-4 w-4 rounded-full bg-white transition-transform"
            style={{ transform: enabled ? 'translateX(18px)' : 'translateX(2px)' }}
          />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cb-threshold" className="text-[10px] text-[#929AA5]">
          Limiar
        </label>
        <input
          id="cb-threshold"
          type="number"
          data-testid="admin-motor-cb-threshold-input"
          value={shownPct}
          min={1}
          max={50}
          step={0.5}
          onChange={(e) => {
            setPctDraft(e.target.value)
            setError(null)
          }}
          className="w-16 bg-[#0B0E11] border border-[rgba(240,185,11,.2)] rounded px-2 py-1 text-xs text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
        />
        <span className="text-[10px] text-[#929AA5]">%</span>
        <button
          type="button"
          data-testid="admin-motor-cb-submit"
          onClick={submitThreshold}
          disabled={mutation.isPending || !pctDirty || !pctValid}
          className="ml-auto px-2.5 py-1 rounded text-[11px] font-semibold bg-[#F0B90B] text-[#080b12] transition-opacity disabled:opacity-40"
        >
          {mutation.isPending ? '...' : 'Salvar'}
        </button>
      </div>

      {error ? (
        <p data-testid="admin-motor-cb-error" className="text-[10px] text-[#F6465D]">
          {error}
        </p>
      ) : data.updatedAt && !pctDirty ? (
        <p className="text-[9px] text-[#5E6673]">
          {enabled ? 'ativo' : 'desligado'} · halt a {data.thresholdPct}% · atualizado{' '}
          {new Date(data.updatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      ) : (
        <p className="text-[9px] text-[#5E6673]">{enabled ? 'ativo' : 'desligado'} · halt a {data.thresholdPct}%</p>
      )}
    </div>
  )
}

const ACTION_BADGE: Record<string, string> = {
  HALT_ASSET: 'bg-red-500/20 text-red-400',
  RELEASE_HALT: 'bg-emerald-500/20 text-emerald-400',
  NEWS_INJECT: 'bg-blue-500/20 text-blue-400',
  UNAUTHORIZED_ATTEMPT: 'bg-yellow-500/20 text-yellow-400',
  ADMIN_BROADCAST: 'bg-purple-500/20 text-purple-400',
}

type MotorTab = 'estado' | 'noticias' | 'matriz' | 'camadas'

const TABS: { id: MotorTab; label: string }[] = [
  { id: 'estado', label: 'Estado' },
  { id: 'noticias', label: 'Notícias' },
  { id: 'matriz', label: 'Matriz' },
  { id: 'camadas', label: 'Camadas' },
]

function AuditLog() {
  const { data: actions, isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: fetchAuditLog,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  return (
    <div data-testid="admin-motor-audit-log" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
      <h2 className="text-sm font-semibold text-[#EAECEF] mb-3">Ações Recentes</h2>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : !actions?.length ? (
        <p className="text-xs text-[#929AA5] py-4 text-center">Nenhuma ação registrada ainda</p>
      ) : (
        <div className="overflow-x-auto">
          <table data-testid="admin-motor-audit-log-table" className="w-full min-w-[480px] text-xs">
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
  const canGlobalHalt = hasAdminRole(adminRole, 'ADMINISTRADOR')

  const [motorHalted, setMotorHalted] = useState(false)
  const [haltLoading, setHaltLoading] = useState(false)

  useEffect(() => {
    if (!canGlobalHalt) return
    fetch('/api/v1/admin/motor/global-halt', { credentials: 'include' })
      .then((r) => r.json())
      .then(({ data }) => setMotorHalted(data?.status === 'halted'))
      .catch(() => {})
  }, [canGlobalHalt])

  const handleGlobalHalt = async () => {
    const msg = motorHalted
      ? 'Retomar o motor de mercado? As negociações serão reativadas imediatamente.'
      : 'Pausar o motor de mercado? TODOS os ativos serão suspensos imediatamente.'
    if (!window.confirm(msg)) return

    setHaltLoading(true)
    try {
      const res = await fetch('/api/v1/admin/motor/global-halt', {
        method: motorHalted ? 'DELETE' : 'POST',
        credentials: 'include',
      })
      if (res.ok) setMotorHalted(!motorHalted)
    } catch {
      /* silently fail — status unchanged */
    } finally {
      setHaltLoading(false)
    }
  }

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
    <div data-testid="admin-motor-content" className="p-4 md:p-6 space-y-5">
      <AdminBreadcrumb />

      <div data-testid="admin-motor-header" className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#EAECEF]">Motor de Mercado</h1>
          <p className="text-xs text-[#929AA5] mt-0.5">Controles, estado ao vivo e configuração</p>
        </div>
        {canGlobalHalt && (
          <button
            data-testid="admin-motor-pause-button"
            onClick={handleGlobalHalt}
            disabled={haltLoading}
            className="px-2.5 py-1 rounded text-[11px] font-semibold border transition-all whitespace-nowrap disabled:opacity-50"
            style={motorHalted
              ? { background: 'rgba(46,189,133,.1)', color: '#2EBD85', borderColor: 'rgba(46,189,133,.3)' }
              : { background: 'rgba(246,70,93,.1)', color: '#F6465D', borderColor: 'rgba(246,70,93,.2)' }
            }
          >
            {haltLoading ? '⏳' : motorHalted ? '▶ Retomar' : '⏸ Pausar'}
          </button>
        )}
      </div>

      {/* KPIs — dados reais */}
      <div data-testid="admin-motor-kpis" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div data-testid="admin-motor-kpi-pnl" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
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

        <div data-testid="admin-motor-kpi-circuit-breakers" className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] p-4">
          {/* div 1 — estado atual (conteúdo original): contagem de ativos suspensos */}
          <div data-testid="admin-motor-kpi-circuit-breakers-status">
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

          {/* div 2 — controle admin: toggle on/off + limiar (%) com submit */}
          {canGlobalHalt && (
            <div
              data-testid="admin-motor-kpi-circuit-breakers-control"
              className="mt-3 pt-3 border-t border-[rgba(240,185,11,.1)]"
            >
              <CircuitBreakerControl />
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div data-testid="admin-motor-tabs" className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            data-testid={`admin-motor-tab-${tab.id}-button`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 px-1.5 py-1.5 rounded text-[11px] font-medium transition-all',
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
        <div data-testid="admin-motor-tab-estado-content" className="space-y-4">
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

      {activeTab === 'camadas' && (
        <div data-testid="admin-motor-tab-camadas-content" className="space-y-4">
          <MotorCamadas />
        </div>
      )}
    </div>
  )
}
