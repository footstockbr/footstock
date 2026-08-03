'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  healthAriaLabel,
  LLM_HEALTH_COLORS,
  type LlmHealthSnapshot,
  type LlmHealthState,
} from '@/lib/news/llm-health'

interface ProviderDto {
  id: string
  slug: string
  name: string
  enabled: boolean
  tokenConfigured: boolean
  isNative: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface ConfigDto {
  llmEnabled: boolean
  activeProviderId: string | null
  configVersion: number
  updatedAt: string
  updatedBy: string | null
}

interface LlmProvidersResponse {
  providers: ProviderDto[]
  config: ConfigDto
  health: LlmHealthSnapshot
}

async function fetchLlmProviders(): Promise<LlmProvidersResponse> {
  const res = await fetch('/api/v1/admin/news/llm-providers', { credentials: 'include' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error?.message ?? 'Erro ao carregar providers de IA')
  }
  const { data } = await res.json()
  return data
}

function StatusDot({
  state,
  label,
}: {
  state: LlmHealthState | undefined
  label: string
}) {
  const color = LLM_HEALTH_COLORS[state ?? 'unknown']
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      data-testid="admin-config-ia-status-dot"
      className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
      style={{ backgroundColor: color }}
    />
  )
}

interface ConfigIAModalProps {
  open: boolean
  onClose: () => void
}

export function ConfigIAModal({ open, onClose }: ConfigIAModalProps) {
  const titleId = useId()
  const queryClient = useQueryClient()
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const [draftEnabled, setDraftEnabled] = useState<Record<string, boolean>>({})
  const [draftActive, setDraftActive] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newToken, setNewToken] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ProviderDto | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [tokenTarget, setTokenTarget] = useState<string | null>(null)
  const [tokenValue, setTokenValue] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-news-llm-providers'],
    queryFn: fetchLlmProviders,
    enabled: open,
    refetchInterval: open ? 15_000 : false,
  })

  // Sincroniza draft quando dados chegam
  useEffect(() => {
    if (!data) return
    const map: Record<string, boolean> = {}
    for (const p of data.providers) map[p.id] = p.enabled
    setDraftEnabled(map)
    setDraftActive(data.config.activeProviderId)
  }, [data])

  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus()
    }, 0)
    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = ''
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusables = panelRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (!focusables.length) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [onClose])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [open, trapFocus])

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!data) throw new Error('Sem dados')
      const res = await fetch('/api/v1/admin/news/llm-providers', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: data.config.configVersion,
          enabledMap: draftEnabled,
          activeProviderId: draftActive,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Erro ao salvar')
      return json.data as { providers: ProviderDto[]; config: ConfigDto }
    },
    onSuccess: () => {
      setFeedback({ type: 'ok', msg: 'Configuração de IA aplicada.' })
      queryClient.invalidateQueries({ queryKey: ['admin-news-llm-providers'] })
    },
    onError: (err: Error) => {
      setFeedback({ type: 'err', msg: err.message })
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/admin/news/llm-providers', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, token: newToken }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Erro ao cadastrar')
      return json.data
    },
    onSuccess: () => {
      setNewName('')
      setNewToken('')
      setShowAdd(false)
      setFeedback({ type: 'ok', msg: 'Provider cadastrado (não selecionado automaticamente).' })
      queryClient.invalidateQueries({ queryKey: ['admin-news-llm-providers'] })
    },
    onError: (err: Error) => {
      setFeedback({ type: 'err', msg: err.message })
    },
  })

  const tokenMutation = useMutation({
    mutationFn: async () => {
      if (!tokenTarget) throw new Error('Sem alvo')
      const res = await fetch(`/api/v1/admin/news/llm-providers/${tokenTarget}/token`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenValue }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Erro ao salvar token')
      return json.data as { providers: ProviderDto[]; config: ConfigDto }
    },
    onSuccess: () => {
      setTokenTarget(null)
      setTokenValue('')
      setFeedback({ type: 'ok', msg: 'Token gravado (criptografado em repouso).' })
      queryClient.invalidateQueries({ queryKey: ['admin-news-llm-providers'] })
    },
    onError: (err: Error) => {
      setFeedback({ type: 'err', msg: err.message })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) throw new Error('Sem alvo')
      const res = await fetch(`/api/v1/admin/news/llm-providers/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error?.message ?? 'Erro ao excluir')
      return json.data
    },
    onSuccess: () => {
      setDeleteTarget(null)
      setConfirmName('')
      setFeedback({ type: 'ok', msg: 'Provider excluído.' })
      queryClient.invalidateQueries({ queryKey: ['admin-news-llm-providers'] })
    },
    onError: (err: Error) => {
      setFeedback({ type: 'err', msg: err.message })
    },
  })

  if (!open) return null

  const health = data?.health
  const healthLabel = healthAriaLabel(health ?? null)
  const submitting =
    applyMutation.isPending ||
    createMutation.isPending ||
    deleteMutation.isPending ||
    tokenMutation.isPending

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="admin-config-ia-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} data-testid="admin-config-ia-modal-backdrop" />
      <div
        ref={panelRef}
        className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-[#1a1815] sm:rounded-xl border border-[rgba(240,185,11,.2)] p-5"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-[#EAECEF] flex items-center gap-2">
              IA
              <StatusDot state={health?.state} label={healthLabel} />
            </h2>
            <p className="text-xs text-[#929AA5] mt-0.5">
              Providers do classificador de notícias — somente SUPER_ADMIN
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            data-testid="admin-config-ia-modal-close"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#929AA5] hover:text-[#EAECEF]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-[#929AA5] py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        )}

        {error && (
          <div role="alert" className="text-sm text-[#F6465D] mb-3">
            {(error as Error).message}
            <button type="button" className="ml-2 underline" onClick={() => refetch()}>
              Tentar novamente
            </button>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            data-testid="admin-config-ia-feedback"
            className={`mb-3 text-xs rounded-lg px-3 py-2 ${
              feedback.type === 'ok'
                ? 'bg-[rgba(46,189,133,.1)] text-[#2EBD85]'
                : 'bg-[rgba(246,70,93,.1)] text-[#F6465D]'
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {data && (
          <div className="space-y-2 mb-4">
            {data.providers.map((p) => {
              const enabled = draftEnabled[p.id] ?? p.enabled
              return (
                <div
                  key={p.id}
                  data-testid={`admin-config-ia-row-${p.slug}`}
                  className="rounded-lg border border-[rgba(240,185,11,.1)] bg-[#0B0E11]"
                >
                  <div className="flex items-center gap-2 px-3 py-2 min-h-[44px]">
                    <input
                      type="radio"
                      name="active-llm-provider"
                      data-testid={`admin-config-ia-radio-${p.slug}`}
                      checked={draftActive === p.id}
                      disabled={!enabled || submitting}
                      onChange={() => setDraftActive(p.id)}
                      aria-label={`Selecionar ${p.name}`}
                      className="accent-[#F0B90B] disabled:opacity-40"
                    />
                    <span className="flex-1 text-sm text-[#EAECEF] truncate">
                      {p.name}
                      {p.tokenConfigured ? (
                        <span className="ml-2 text-[10px] text-[#929AA5]">token ok</span>
                      ) : (
                        <span className="ml-2 text-[10px] text-[#F0B90B]">env/token pendente</span>
                      )}
                    </span>
                    <button
                      type="button"
                      data-testid={`admin-config-ia-token-toggle-${p.slug}`}
                      aria-label={`${p.tokenConfigured ? 'Trocar' : 'Definir'} token de ${p.name}`}
                      aria-expanded={tokenTarget === p.id}
                      title={`${p.tokenConfigured ? 'Trocar' : 'Definir'} token`}
                      disabled={submitting}
                      onClick={() => {
                        setTokenValue('')
                        setTokenTarget((cur) => (cur === p.id ? null : p.id))
                      }}
                      className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-[rgba(240,185,11,.1)] ${
                        tokenTarget === p.id ? 'text-[#F0B90B]' : 'text-[#929AA5]'
                      }`}
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      data-testid={`admin-config-ia-toggle-${p.slug}`}
                      disabled={submitting}
                      onClick={() => {
                        const next = !enabled
                        setDraftEnabled((m) => ({ ...m, [p.id]: next }))
                        if (!next && draftActive === p.id) setDraftActive(null)
                      }}
                      className={`relative h-6 w-11 rounded-full transition-colors min-h-[24px] ${
                        enabled ? 'bg-[#2EBD85]' : 'bg-[#3a3f47]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                          enabled ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      data-testid={`admin-config-ia-delete-${p.slug}`}
                      aria-label={`Excluir ${p.name}`}
                      disabled={submitting}
                      onClick={() => {
                        setDeleteTarget(p)
                        setConfirmName('')
                      }}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[#F6465D] hover:bg-[rgba(246,70,93,.1)] rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {tokenTarget === p.id && (
                    <form
                      data-testid={`admin-config-ia-token-form-${p.slug}`}
                      className="px-3 pb-3 pt-1 space-y-2 border-t border-[rgba(240,185,11,.08)]"
                      onSubmit={(e) => {
                        e.preventDefault()
                        setFeedback(null)
                        tokenMutation.mutate()
                      }}
                    >
                      <label
                        className="block text-[10px] text-[#929AA5] uppercase tracking-wide pt-2"
                        htmlFor={`llm-token-${p.slug}`}
                      >
                        Token de {p.name}
                      </label>
                      <input
                        id={`llm-token-${p.slug}`}
                        type="password"
                        data-testid={`admin-config-ia-token-input-${p.slug}`}
                        value={tokenValue}
                        onChange={(e) => setTokenValue(e.target.value)}
                        placeholder={p.tokenConfigured ? 'Colar novo token para substituir' : 'Colar token'}
                        className="w-full bg-[#1a1815] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-sm font-mono text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
                        autoComplete="new-password"
                        spellCheck={false}
                      />
                      <p className="text-[10px] text-[#929AA5]">
                        Gravado criptografado (AES-256-GCM). Nunca é exibido de volta — para conferir,
                        só substituindo.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          data-testid={`admin-config-ia-token-save-${p.slug}`}
                          disabled={submitting || !tokenValue.trim()}
                          className="min-h-[44px] px-4 rounded-lg bg-[#2EBD85] text-[#080b12] text-sm font-medium disabled:opacity-50"
                        >
                          {tokenMutation.isPending ? 'Salvando...' : 'Salvar token'}
                        </button>
                        <button
                          type="button"
                          data-testid={`admin-config-ia-token-cancel-${p.slug}`}
                          onClick={() => {
                            setTokenTarget(null)
                            setTokenValue('')
                          }}
                          className="min-h-[44px] px-3 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5]"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            data-testid="admin-config-ia-submit"
            disabled={submitting || !data}
            onClick={() => {
              setFeedback(null)
              applyMutation.mutate()
            }}
            className="min-h-[44px] px-4 rounded-lg bg-[#F0B90B] text-[#080b12] text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {applyMutation.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aplicando...
              </>
            ) : (
              'Aplicar seleção'
            )}
          </button>
          <button
            type="button"
            data-testid="admin-config-ia-add-toggle"
            disabled={submitting}
            onClick={() => setShowAdd((v) => !v)}
            className="min-h-[44px] min-w-[44px] px-3 rounded-lg border border-[rgba(240,185,11,.2)] text-[#EAECEF] text-sm flex items-center justify-center gap-1"
            aria-label="Adicionar provider"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {showAdd && (
          <form
            data-testid="admin-config-ia-add-form"
            className="space-y-3 mb-4 p-3 rounded-lg border border-[rgba(240,185,11,.15)] bg-[#0B0E11]"
            onSubmit={(e) => {
              e.preventDefault()
              setFeedback(null)
              createMutation.mutate()
            }}
          >
            <div>
              <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1" htmlFor="llm-new-name">
                Nome
              </label>
              <input
                id="llm-new-name"
                data-testid="admin-config-ia-add-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-[#1a1815] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-sm text-[#EAECEF] focus:outline-none focus:border-[#F0B90B]"
                placeholder="Kimi ou Anthropic"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1" htmlFor="llm-new-token">
                Token
              </label>
              <input
                id="llm-new-token"
                type="password"
                data-testid="admin-config-ia-add-token"
                value={newToken}
                onChange={(e) => setNewToken(e.target.value)}
                className="w-full bg-[#1a1815] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-sm font-mono text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              data-testid="admin-config-ia-add-save"
              disabled={submitting || !newName.trim() || !newToken.trim()}
              className="min-h-[44px] px-4 rounded-lg bg-[#2EBD85] text-[#080b12] text-sm font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        )}

        {deleteTarget && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="llm-delete-title"
            data-testid="admin-config-ia-delete-confirm"
            className="mt-2 p-3 rounded-lg border border-[rgba(246,70,93,.3)] bg-[rgba(246,70,93,.06)] space-y-3"
          >
            <h3 id="llm-delete-title" className="text-sm font-semibold text-[#F6465D]">
              Excluir {deleteTarget.name}?
            </h3>
            <p className="text-xs text-[#929AA5]">
              Digite o nome <strong className="text-[#EAECEF]">{deleteTarget.name}</strong> para confirmar.
              {deleteTarget.isActive
                ? ' O provider ativo será desligado (Node-only) antes da exclusão.'
                : ''}
            </p>
            <input
              data-testid="admin-config-ia-delete-confirm-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="w-full bg-[#0B0E11] border border-[rgba(246,70,93,.3)] rounded-lg px-3 py-2 text-sm text-[#EAECEF]"
              placeholder={deleteTarget.name}
            />
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="admin-config-ia-delete-cancel"
                onClick={() => {
                  setDeleteTarget(null)
                  setConfirmName('')
                }}
                className="min-h-[44px] px-3 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5]"
              >
                Cancelar
              </button>
              <button
                type="button"
                data-testid="admin-config-ia-delete-confirm-btn"
                disabled={submitting || confirmName !== deleteTarget.name}
                onClick={() => {
                  setFeedback(null)
                  deleteMutation.mutate()
                }}
                className="min-h-[44px] px-3 rounded-lg bg-[#F6465D] text-white text-sm font-medium disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Botao/aba IA com bolinha de status (fora do modal). */
export function ConfigIATabButton({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  const { data } = useQuery({
    queryKey: ['admin-news-llm-providers'],
    queryFn: fetchLlmProviders,
    refetchInterval: 15_000,
  })
  const health = data?.health
  const label = healthAriaLabel(health ?? null)

  return (
    <button
      type="button"
      data-testid="admin-configuracoes-tab-ia-button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
        active
          ? 'bg-[#F0B90B] text-[#080b12]'
          : 'bg-[#1E2329] text-[#929AA5] border border-[rgba(240,185,11,.1)] hover:border-[rgba(240,185,11,.3)]'
      }`}
    >
      <span>IA</span>
      <StatusDot state={health?.state} label={label} />
    </button>
  )
}
