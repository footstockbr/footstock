'use client'

// ============================================================================
// Foot Stock — AliasManagement (T-031)
// Módulo admin para gerenciamento de aliases de ticker.
//
// Funcionalidades:
//   - Lista todos os aliases de um ativo (ticker canônico)
//   - Adicionar novo alias com validação de formato
//   - Remover alias com confirmação
//   - Feedback visual (toast) em todas as ações
// ============================================================================

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AliasManagementProps {
  /** Ticker canônico do ativo (ex: "URU3") */
  ticker: string
  /** displayName do ativo para contexto visual */
  displayName?: string
}

interface AliasListData {
  data: {
    ticker: string
    aliases: string[]
    count: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchAliases(ticker: string): Promise<AliasListData> {
  const res = await fetch(`/api/v1/admin/assets/${ticker}/aliases`, {
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? 'Erro ao carregar aliases.')
  }
  return res.json()
}

async function addAlias(ticker: string, alias: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/assets/${ticker}/aliases`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alias }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? 'Erro ao adicionar alias.')
  }
}

async function removeAlias(ticker: string, alias: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/assets/${ticker}/aliases/${alias}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message ?? 'Erro ao remover alias.')
  }
}

// Validação de formato: 2-5 letras + 1-2 dígitos
const ALIAS_REGEX = /^[A-Za-z]{2,5}\d{1,2}$/

function validateAlias(value: string): string | null {
  if (!value.trim()) return 'Alias obrigatório.'
  if (!ALIAS_REGEX.test(value.trim())) {
    return 'Formato inválido. Use 2-5 letras + 1-2 dígitos (ex: FLA3).'
  }
  return null
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AliasManagement({ ticker, displayName }: AliasManagementProps) {
  const queryClient = useQueryClient()
  const [newAlias, setNewAlias] = useState('')
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const queryKey = ['admin', 'aliases', ticker]

  // ── Fetch aliases ──────────────────────────────────────────────────────────

  const { data, isLoading, isError } = useQuery<AliasListData, Error>({
    queryKey,
    queryFn: () => fetchAliases(ticker),
    retry: 1,
  })

  // ── Add alias mutation ─────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: (alias: string) => addAlias(ticker, alias),
    onSuccess: () => {
      setNewAlias('')
      setAliasError(null)
      queryClient.invalidateQueries({ queryKey })
      showToast('success', `Alias adicionado com sucesso.`)
    },
    onError: (err: Error) => {
      showToast('error', err.message)
    },
  })

  // ── Remove alias mutation ──────────────────────────────────────────────────

  const removeMutation = useMutation({
    mutationFn: (alias: string) => removeAlias(ticker, alias),
    onSuccess: (_, alias) => {
      setConfirmRemove(null)
      queryClient.invalidateQueries({ queryKey })
      showToast('success', `Alias ${alias} removido.`)
    },
    onError: (err: Error) => {
      setConfirmRemove(null)
      showToast('error', err.message)
    },
  })

  // ── Handlers ──────────────────────────────────────────────────────────────

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  function handleAdd() {
    const error = validateAlias(newAlias)
    if (error) {
      setAliasError(error)
      return
    }
    setAliasError(null)
    addMutation.mutate(newAlias.toUpperCase().trim())
  }

  function handleRemoveConfirm() {
    if (!confirmRemove) return
    removeMutation.mutate(confirmRemove)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const aliases = data?.data?.aliases ?? []

  return (
    <div className="space-y-4 rounded-lg border border-neutral-700 bg-neutral-900 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">
            Aliases — {ticker}
          </h3>
          {displayName && (
            <p className="text-xs text-neutral-400">{displayName}</p>
          )}
        </div>
        <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
          {aliases.length} alias{aliases.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Toast feedback */}
      {toast && (
        <div
          role="alert"
          className={`rounded-md px-3 py-2 text-sm ${
            toast.type === 'success'
              ? 'bg-green-900/50 text-green-300'
              : 'bg-red-900/50 text-red-300'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Lista de aliases */}
      {isLoading && (
        <p className="text-xs text-neutral-400">Carregando aliases...</p>
      )}
      {isError && (
        <p className="text-xs text-red-400">Erro ao carregar aliases.</p>
      )}

      {!isLoading && !isError && (
        <div className="space-y-1">
          {aliases.length === 0 ? (
            <p className="text-xs text-neutral-500">Nenhum alias cadastrado.</p>
          ) : (
            aliases.map((alias) => (
              <div
                key={alias}
                className="flex items-center justify-between rounded-md bg-neutral-800 px-3 py-1.5"
              >
                <span className="font-mono text-sm text-neutral-200">{alias}</span>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(alias)}
                  disabled={removeMutation.isPending}
                  className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                  aria-label={`Remover alias ${alias}`}
                >
                  Remover
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Formulário de adição */}
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            value={newAlias}
            onChange={(e) => {
              setNewAlias(e.target.value)
              if (aliasError) setAliasError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
            }}
            placeholder="FLA3"
            maxLength={6}
            aria-label="Novo alias"
            aria-describedby={aliasError ? 'alias-error' : undefined}
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-3 py-1.5 font-mono text-sm uppercase text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          {aliasError && (
            <p id="alias-error" className="mt-1 text-xs text-red-400">
              {aliasError}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={addMutation.isPending}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {addMutation.isPending ? 'Adicionando...' : 'Adicionar'}
        </button>
      </div>

      {/* Modal de confirmação de remoção */}
      {confirmRemove && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-remove-title"
          className="rounded-md border border-red-700 bg-red-950/40 p-3 space-y-2"
        >
          <p id="confirm-remove-title" className="text-sm text-red-200">
            Remover alias <strong className="font-mono">{confirmRemove}</strong>?
            Esta ação pode ser revertida re-adicionando o alias.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRemoveConfirm}
              disabled={removeMutation.isPending}
              className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {removeMutation.isPending ? 'Removendo...' : 'Confirmar remoção'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(null)}
              disabled={removeMutation.isPending}
              className="rounded-md bg-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-600 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
