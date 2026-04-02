'use client'

import { useCallback, useEffect, useState } from 'react'
import { USER_STATUS } from '@/lib/enums'

interface FlaggedPostItem {
  id: string
  content: string
  ticker: string | null
  flagCount: number
  likesCount: number
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    status: 'ACTIVE' | 'SUSPENDED' | 'BANNED'
    adminRole: string | null
  }
}

interface ModerationRule {
  id: number
  name: string
  description: string
  enabled: boolean
}

interface BlockedWord {
  id: string
  word: string
  createdAt: string
}

interface PendingAction {
  postId: string
  action: 'reject' | 'ban_user'
  label: string
}

export function ModerationPageClient() {
  const [flaggedPosts, setFlaggedPosts] = useState<FlaggedPostItem[]>([])
  const [rules, setRules] = useState<ModerationRule[]>([])
  const [blockedWords, setBlockedWords] = useState<BlockedWord[]>([])
  const [newWord, setNewWord] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [flaggedRes, rulesRes, wordsRes] = await Promise.all([
        fetch('/api/v1/admin/moderation/flagged?limit=50'),
        fetch('/api/v1/admin/moderation/rules'),
        fetch('/api/v1/admin/moderation/blocked-words'),
      ])

      if (!flaggedRes.ok || !rulesRes.ok || !wordsRes.ok) {
        throw new Error('fetch-failed')
      }

      const [flaggedJson, rulesJson, wordsJson] = await Promise.all([
        flaggedRes.json(),
        rulesRes.json(),
        wordsRes.json(),
      ])

      setFlaggedPosts((flaggedJson?.data?.items ?? []) as FlaggedPostItem[])
      setRules((rulesJson?.data ?? []) as ModerationRule[])
      setBlockedWords((wordsJson?.data ?? []) as BlockedWord[])
    } catch {
      setError('Não foi possível carregar os dados de moderação.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function moderatePost(postId: string, action: 'approve' | 'reject' | 'ban_user') {
    setError(null)
    setSuccess(null)
    setActionLoading(`${action}-${postId}`)
    try {
      const res = await fetch(`/api/v1/admin/moderation/flagged/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Falha ao moderar post.')
        return
      }
      const labels: Record<string, string> = {
        approve: 'Post aprovado.',
        reject: 'Post rejeitado e removido.',
        ban_user: 'Post removido e usuário banido.',
      }
      setSuccess(labels[action] ?? 'Ação executada.')
      await loadData()
    } catch {
      setError('Erro de conexão ao moderar post.')
    } finally {
      setActionLoading(null)
    }
  }

  function confirmDestructiveAction(postId: string, action: 'reject' | 'ban_user') {
    const labels: Record<string, string> = {
      reject: 'Tem certeza que deseja rejeitar e remover este post?',
      ban_user: 'Tem certeza que deseja remover o post e banir o autor? Esta ação é irreversível.',
    }
    setPendingAction({ postId, action, label: labels[action] ?? '' })
  }

  async function executePendingAction() {
    if (!pendingAction) return
    setPendingAction(null)
    await moderatePost(pendingAction.postId, pendingAction.action)
  }

  async function reactivateUser(userId: string) {
    setError(null)
    setSuccess(null)
    setActionLoading(`reactivate-${userId}`)
    try {
      const res = await fetch(`/api/v1/admin/moderation/users/${userId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suspend: false,
          reason: 'Reativação aplicada via módulo de moderação',
        }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Falha ao reativar usuário.')
        return
      }
      setSuccess('Usuário reativado.')
      await loadData()
    } catch {
      setError('Erro de conexão ao reativar usuário.')
    } finally {
      setActionLoading(null)
    }
  }

  async function toggleRule(rule: ModerationRule) {
    setError(null)
    setSuccess(null)
    setActionLoading(`rule-${rule.id}`)
    try {
      const res = await fetch('/api/v1/admin/moderation/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId: rule.id, enabled: !rule.enabled }),
      })
      if (!res.ok) {
        setError('Falha ao atualizar regra.')
        return
      }
      setSuccess('Regra atualizada.')
      await loadData()
    } catch {
      setError('Erro de conexão ao atualizar regra.')
    } finally {
      setActionLoading(null)
    }
  }

  async function addBlockedWord() {
    const word = newWord.trim().toLowerCase()
    if (!word) return
    setError(null)
    setSuccess(null)
    setActionLoading('add-word')
    try {
      const res = await fetch('/api/v1/admin/moderation/blocked-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Falha ao adicionar palavra bloqueada.')
        return
      }
      setSuccess('Palavra bloqueada adicionada.')
      setNewWord('')
      await loadData()
    } catch {
      setError('Erro de conexão ao adicionar palavra bloqueada.')
    } finally {
      setActionLoading(null)
    }
  }

  async function removeBlockedWord(id: string) {
    setError(null)
    setSuccess(null)
    setActionLoading(`remove-${id}`)
    try {
      const res = await fetch(`/api/v1/admin/moderation/blocked-words/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Falha ao remover palavra bloqueada.')
        return
      }
      setSuccess('Palavra bloqueada removida.')
      await loadData()
    } catch {
      setError('Erro de conexão ao remover palavra bloqueada.')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h1 className="text-lg font-semibold text-zinc-100">Moderação</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Gestão de posts sinalizados, suspensão temporária de usuários e filtros de palavras.
        </p>
      </header>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          <p>{error}</p>
          <button
            onClick={() => void loadData()}
            className="ml-3 rounded-md border border-red-800 px-2 py-1 text-xs text-red-300 hover:border-red-600"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {success && <p className="rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{success}</p>}

      <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Posts sinalizados</h2>
        {isLoading ? (
          <p className="mt-3 text-sm text-zinc-400">Carregando...</p>
        ) : flaggedPosts.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Nenhum post sinalizado na fila.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="px-2 py-2">Post</th>
                  <th className="px-2 py-2">Autor</th>
                  <th className="px-2 py-2">Flags</th>
                  <th className="px-2 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {flaggedPosts.map(post => (
                  <tr key={post.id} className="border-b border-zinc-800/60 text-zinc-200">
                    <td className="px-2 py-2">
                      <p className="max-w-xl text-sm">{post.content}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {post.ticker ? `Ticker: ${post.ticker} · ` : ''}
                        {new Date(post.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </td>
                    <td className="px-2 py-2">
                      <p>{post.user.name}</p>
                      <p className="text-xs text-zinc-500">{post.user.email}</p>
                      <p className="text-xs text-zinc-500">Status: {post.user.status}</p>
                    </td>
                    <td className="px-2 py-2">
                      <p className="font-semibold text-amber-400">{post.flagCount}</p>
                      <p className="text-xs text-zinc-500">Likes: {post.likesCount}</p>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void moderatePost(post.id, 'approve')}
                          disabled={actionLoading !== null}
                          className="rounded-md border border-emerald-800 px-2 py-1 text-xs text-emerald-300 disabled:opacity-50"
                        >
                          {actionLoading === `approve-${post.id}` ? 'Aprovando...' : 'Aprovar'}
                        </button>
                        <button
                          onClick={() => confirmDestructiveAction(post.id, 'reject')}
                          disabled={actionLoading !== null}
                          className="rounded-md border border-amber-800 px-2 py-1 text-xs text-amber-300 disabled:opacity-50"
                        >
                          {actionLoading === `reject-${post.id}` ? 'Rejeitando...' : 'Rejeitar'}
                        </button>
                        {post.user.status === USER_STATUS.SUSPENDED ? (
                          <button
                            onClick={() => void reactivateUser(post.user.id)}
                            disabled={actionLoading !== null}
                            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 disabled:opacity-50"
                          >
                            {actionLoading === `reactivate-${post.user.id}` ? 'Reativando...' : 'Reativar usuário'}
                          </button>
                        ) : (
                          <button
                            onClick={() => confirmDestructiveAction(post.id, 'ban_user')}
                            disabled={actionLoading !== null}
                            className="rounded-md border border-red-800 px-2 py-1 text-xs text-red-300 disabled:opacity-50"
                          >
                            {actionLoading === `ban_user-${post.id}` ? 'Banindo...' : 'Banir usuário'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Palavras bloqueadas</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={newWord}
            onChange={e => setNewWord(e.target.value)}
            placeholder="Adicionar palavra"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
          />
          <button
            onClick={() => void addBlockedWord()}
            disabled={actionLoading === 'add-word'}
            className="rounded-md bg-[#F0B90B] px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {actionLoading === 'add-word' ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {blockedWords.map(word => (
            <span
              key={word.id}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-200"
            >
              {word.word}
              <button
                onClick={() => void removeBlockedWord(word.id)}
                disabled={actionLoading === `remove-${word.id}`}
                className="text-red-300 hover:text-red-200 disabled:opacity-50"
                aria-label={`Remover palavra ${word.word}`}
              >
                {actionLoading === `remove-${word.id}` ? '...' : '×'}
              </button>
            </span>
          ))}
          {blockedWords.length === 0 && <p className="text-sm text-zinc-500">Nenhuma palavra cadastrada.</p>}
        </div>
      </article>

      <article className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-100">Regras automáticas de moderação</h2>
        <div className="mt-3 space-y-2">
          {rules.map(rule => (
            <div
              key={rule.id}
              className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 p-3"
            >
              <div>
                <p className="text-sm text-zinc-200">{rule.name}</p>
                <p className="text-xs text-zinc-500">{rule.description}</p>
              </div>
              <button
                onClick={() => void toggleRule(rule)}
                disabled={actionLoading === `rule-${rule.id}`}
                className={`rounded-md border px-3 py-1 text-xs disabled:opacity-50 ${
                  rule.enabled
                    ? 'border-emerald-700 text-emerald-300'
                    : 'border-zinc-700 text-zinc-300'
                }`}
              >
                {actionLoading === `rule-${rule.id}` ? 'Salvando...' : rule.enabled ? 'Ativada' : 'Desativada'}
              </button>
            </div>
          ))}
          {rules.length === 0 && <p className="text-sm text-zinc-500">Nenhuma regra disponível.</p>}
        </div>
      </article>
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6">
            <h3 className="text-sm font-semibold text-zinc-100">Confirmar ação</h3>
            <p className="mt-2 text-sm text-zinc-300">{pendingAction.label}</p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setPendingAction(null)}
                className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300"
              >
                Cancelar
              </button>
              <button
                onClick={() => void executePendingAction()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

