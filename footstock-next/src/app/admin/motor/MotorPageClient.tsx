'use client'

import { useState, useEffect, type FormEvent } from 'react'
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
import {
  type GlobalHaltFlow,
  expectedToken,
  normalizeReason,
  validateGlobalHaltConfirm,
  REASON_MAX,
} from '@/lib/utils/global-halt-confirm'
import { orchestrateGlobalHalt } from '@/lib/admin/global-halt-orchestrator'
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

// Diálogo de confirmação digitada para pausar/retomar o motor inteiro. Barreira
// canônica única: token incorreto ou motivo inválido APENAS exibem erro e bloqueiam
// o submit (diálogo permanece aberto); o cancelamento ocorre só ao fechar/cancelar.
// Digitar errado nunca dispara B/C nem cancela sozinho.
interface GlobalHaltConfirmDialogProps {
  flow: GlobalHaltFlow
  token: string
  reason: string
  onTokenChange: (value: string) => void
  onReasonChange: (value: string) => void
  onCancel: () => void
  onConfirm: (reason: string) => void
}

function GlobalHaltConfirmDialog({
  flow,
  token,
  reason,
  onTokenChange,
  onReasonChange,
  onCancel,
  onConfirm,
}: GlobalHaltConfirmDialogProps) {
  const isResuming = flow === 'resume'
  const word = expectedToken(flow)
  const validation = validateGlobalHaltConfirm(flow, token, reason)
  const reasonLen = normalizeReason(reason).length

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    // Submit bloqueado quando inválido: nenhum efeito colateral, diálogo segue aberto.
    if (!validation.canSubmit) return
    onConfirm(normalizeReason(reason))
  }

  return (
    <div
      data-testid="admin-motor-confirm-overlay"
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <form
        data-testid="admin-motor-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-motor-confirm-title"
        className="w-full max-w-md space-y-4 rounded-xl border border-[rgba(240,185,11,.2)] bg-[#1E2329] p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div>
          <h2 id="admin-motor-confirm-title" className="text-sm font-semibold text-[#EAECEF]">
            {isResuming ? 'Confirmar retomada do motor' : 'Confirmar pausa do motor'}
          </h2>
          <p className="mt-1 text-xs text-[#929AA5]">
            {isResuming
              ? 'Retomar libera novas ordens e reativa o motor de TODOS os ativos (suspensões por circuit breaker são preservadas).'
              : 'Pausar congela o motor inteiro: TODOS os ativos são suspensos e novas ordens ficam bloqueadas imediatamente. Não é o mesmo que ajustar camadas.'}
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="admin-motor-confirm-token" className="block text-[10px] uppercase tracking-wide text-[#929AA5]">
            Digite <span className="font-mono font-semibold text-[#F0B90B]">{word}</span> para confirmar
          </label>
          <input
            id="admin-motor-confirm-token"
            data-testid="admin-motor-confirm-token-input"
            type="text"
            autoComplete="off"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            aria-invalid={validation.tokenError !== null}
            className="w-full rounded border border-[rgba(240,185,11,.2)] bg-[#0B0E11] px-3 py-2 text-sm text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
          />
          {validation.tokenError && (
            <p data-testid="admin-motor-confirm-token-error" className="text-[10px] text-[#F6465D]">
              {validation.tokenError}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="admin-motor-confirm-reason" className="block text-[10px] uppercase tracking-wide text-[#929AA5]">
            Motivo (auditável, 10 a {REASON_MAX} caracteres)
          </label>
          <textarea
            id="admin-motor-confirm-reason"
            data-testid="admin-motor-confirm-reason-input"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            maxLength={REASON_MAX}
            aria-invalid={validation.reasonError !== null}
            className="w-full resize-none rounded border border-[rgba(240,185,11,.2)] bg-[#0B0E11] px-3 py-2 text-sm text-[#EAECEF] focus:border-[#F0B90B] focus:outline-none"
          />
          <div className="flex items-center justify-between">
            {validation.reasonError ? (
              <p data-testid="admin-motor-confirm-reason-error" className="text-[10px] text-[#F6465D]">
                {validation.reasonError}
              </p>
            ) : (
              <span />
            )}
            <span className="text-[9px] text-[#5E6673]">{reasonLen}/{REASON_MAX}</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            data-testid="admin-motor-confirm-cancel"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-[11px] font-semibold border border-[rgba(240,185,11,.2)] text-[#929AA5] transition-colors hover:text-[#EAECEF]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="admin-motor-confirm-submit"
            disabled={!validation.canSubmit}
            className="rounded px-3 py-1.5 text-[11px] font-semibold transition-opacity disabled:opacity-40"
            style={isResuming
              ? { background: 'rgba(46,189,133,.15)', color: '#2EBD85', border: '1px solid rgba(46,189,133,.3)' }
              : { background: 'rgba(246,70,93,.15)', color: '#F6465D', border: '1px solid rgba(246,70,93,.3)' }
            }
          >
            {isResuming ? 'Retomar motor' : 'Pausar motor'}
          </button>
        </div>
      </form>
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

  const queryClient = useQueryClient()
  const [motorHalted, setMotorHalted] = useState(false)
  const [haltLoading, setHaltLoading] = useState(false)
  // Zero Silêncio / Zero Estados Indefinidos: a orquestração nunca falha calada.
  const [haltError, setHaltError] = useState<string | null>(null)
  // RESUME_ALL preserva suspensões de circuit breaker — a UI sinaliza quando o
  // motor segue pausado mesmo após Retomar (não pode afirmar "voltou").
  const [cbPreservedWarning, setCbPreservedWarning] = useState(false)

  // Barreira de confirmação digitada (substitui o window.confirm simples). Enquanto
  // confirmFlow != null o diálogo está aberto; só ao confirmar com token + motivo
  // válidos a orquestração B/C dispara. Fechar/cancelar encerra sem efeito colateral.
  const [confirmFlow, setConfirmFlow] = useState<GlobalHaltFlow | null>(null)
  const [confirmToken, setConfirmToken] = useState('')
  const [confirmReason, setConfirmReason] = useState('')

  useEffect(() => {
    if (!canGlobalHalt) return
    fetch('/api/v1/admin/motor/global-halt', { credentials: 'include' })
      .then((r) => r.json())
      .then(({ data }) => setMotorHalted(data?.status === 'halted'))
      .catch(() => {})
  }, [canGlobalHalt])

  // Reconcilia o efeito B (bloqueio de ordens) + rótulo/estilo do botão a partir da
  // fonte canônica (GET global-halt). NUNCA inverte motorHalted às cegas: o estado
  // exibido vem sempre do backend, refletindo o que de fato persistiu.
  const reconcileHaltState = async () => {
    try {
      const r = await fetch('/api/v1/admin/motor/global-halt', { credentials: 'include' })
      // Nao rebaixar para "running" a partir de uma leitura nao confirmada: se o GET
      // falhar (4xx/5xx ou success!=true), preserva o ultimo estado conhecido em vez
      // de afirmar um estado fantasma. O proximo GET (mount/refresh) reconcilia.
      if (!r.ok) return
      const body = await r.json().catch(() => null)
      if (body?.success !== true) return
      setMotorHalted(body.data?.status === 'halted')
    } catch {
      /* reconciliação best-effort; o próximo GET (mount/refresh) corrige */
    }
  }

  // Abre o diálogo de confirmação digitada. Não dispara nenhum efeito colateral:
  // só ao confirmar com token + motivo válidos a orquestração B/C roda.
  const openGlobalHaltConfirm = () => {
    if (haltLoading) return
    setConfirmFlow(motorHalted ? 'resume' : 'halt')
    setConfirmToken('')
    setConfirmReason('')
    setHaltError(null)
    setCbPreservedWarning(false)
  }

  // Cancelamento: fecha o diálogo sem qualquer efeito colateral (B/C não disparam).
  const cancelGlobalHaltConfirm = () => {
    setConfirmFlow(null)
    setConfirmToken('')
    setConfirmReason('')
  }

  // Orquestra os DOIS efeitos canônicos numa única ação, em ordem fixa, usando o
  // motivo digitado pelo operador (auditável; chega na rota e na trilha de audit
  // existente). Pausar = B (bloquear ordens) -> C (HALT_ALL no motor real).
  // Retomar = C (RESUME_ALL) -> B (liberar ordens), para nunca abrir janela em que
  // ordens entrem com o motor ainda em transição. Falha parcial = fail-loud +
  // reconciliação via GET global-halt (sem estado fantasma na UI).
  const runGlobalHalt = async (flow: GlobalHaltFlow, reason: string) => {
    setConfirmFlow(null)
    setHaltLoading(true)
    setHaltError(null)
    setCbPreservedWarning(false)

    try {
      // Sequencia de rede + decisao B/C extraida para modulo puro (testavel sem DOM).
      // O estado da UI (erro, reconciliacao, CB preservado) permanece aqui.
      const outcome = await orchestrateGlobalHalt(flow, reason, fetch)
      if (outcome.error) setHaltError(outcome.error)

      // Reconcilia o botao a partir da fonte canonica (GET global-halt) em TODOS os
      // caminhos — sucesso ou falha parcial — sem estado fantasma na UI.
      await reconcileHaltState()

      if (outcome.checkCbPreserved) {
        // RESUME_ALL limpa apenas halts de admin (haltReason='HALT_ALL'); ativos em
        // CIRCUIT_BREAKER seguem isPaused. A UI não pode mentir dizendo que o motor
        // voltou — sinaliza o CB preservado lendo a fonte canônica dos KPIs.
        try {
          await queryClient.invalidateQueries({ queryKey: ['motor-kpis'] })
          const freshKpis = await fetchMotorKpis()
          if ((freshKpis.circuitBreakers ?? 0) > 0) setCbPreservedWarning(true)
        } catch {
          /* best-effort; o KPI card já reflete o estado de CB de forma independente */
        }
      }
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
            onClick={openGlobalHaltConfirm}
            disabled={haltLoading}
            title={motorHalted
              ? 'Retomar o motor: libera novas ordens e reativa os ativos (suspensões por circuit breaker são preservadas)'
              : 'Pausar o motor: congela todos os ativos e bloqueia novas ordens (não confunda com ajustar camadas)'}
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

      {/* Zero Silêncio: falha de orquestração nunca fica calada. Identificador
          canônico único: admin-motor-pause-error. Ciclo de vida do erro: a falha
          o exibe; uma nova tentativa de pausa/retomada limpa o erro anterior no
          início (openGlobalHaltConfirm + runGlobalHalt); o sucesso o remove. */}
      {haltError && (
        <div
          data-testid="admin-motor-pause-error"
          role="alert"
          className="rounded-lg border border-[rgba(246,70,93,.3)] bg-[rgba(246,70,93,.08)] px-3 py-2 text-xs text-[#F6465D]"
        >
          {haltError}
        </div>
      )}

      {/* Barreira de confirmação digitada: token do fluxo (PAUSAR/RETOMAR) + motivo
          (10..500) antes de qualquer efeito colateral (Zero Silêncio / Zero Assumido) */}
      {confirmFlow && (
        <GlobalHaltConfirmDialog
          flow={confirmFlow}
          token={confirmToken}
          reason={confirmReason}
          onTokenChange={setConfirmToken}
          onReasonChange={setConfirmReason}
          onCancel={cancelGlobalHaltConfirm}
          onConfirm={(reason) => runGlobalHalt(confirmFlow, reason)}
        />
      )}

      {/* Sucesso parcial (Retomar com CB ativo): ordens liberadas, motor ainda pausado */}
      {cbPreservedWarning && (
        <div
          data-testid="admin-motor-cb-preserved-warning"
          role="status"
          className="rounded-lg border border-[rgba(240,185,11,.3)] bg-[rgba(240,185,11,.08)] px-3 py-2 text-xs text-[#F0B90B]"
        >
          Ordens reativadas; o motor segue pausado por circuit breaker em um ou mais ativos.
        </div>
      )}

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
