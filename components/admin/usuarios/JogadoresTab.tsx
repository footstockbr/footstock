'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { canAccess } from '@/lib/auth/canAccess'
import type { AdminRole as CanonicalAdminRole } from '@/lib/enums'
import { USER_STATUS } from '@/lib/enums'
import { SuspendDialog } from './SuspendDialog'
import { ResetBalanceDialog } from './ResetBalanceDialog'
import { UserDetailRow } from './UserDetailRow'
import type { AdminRole, PlanType, UserStatus, RegularUser, PaginationMeta } from './types'

interface JogadoresTabProps {
  sessionRole: AdminRole | null
}

export function JogadoresTab({ sessionRole }: JogadoresTabProps) {
  const [users, setUsers] = useState<RegularUser[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<PlanType | ''>('')
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('')
  const [page, setPage] = useState(1)

  const [suspendTarget, setSuspendTarget] = useState<RegularUser | null>(null)
  const [resetBalanceTarget, setResetBalanceTarget] = useState<RegularUser | null>(null)

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canSuspend = sessionRole
    ? canAccess(sessionRole as CanonicalAdminRole, 'users:suspend')
    : false
  const canResetBalance = sessionRole
    ? canAccess(sessionRole as CanonicalAdminRole, 'financial:write')
    : false

  const fetchUsers = useCallback(
    async (p: number, s: string, plan: string, status: string) => {
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({ page: String(p), limit: '20' })
        if (s.trim()) params.set('search', s.trim())
        if (plan) params.set('planType', plan)
        if (status) params.set('status', status)

        const res = await fetch(`/api/v1/admin/users?${params.toString()}`)
        if (!res.ok) {
          setError('Erro ao carregar jogadores.')
          return
        }
        const json = (await res.json()) as { data?: RegularUser[]; meta?: PaginationMeta }
        setUsers(json.data ?? [])
        if (json.meta) setMeta(json.meta)
      } catch {
        setError('Erro de conexão ao carregar jogadores.')
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void fetchUsers(page, search, planFilter, statusFilter)
  }, [page, planFilter, statusFilter, fetchUsers])

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      void fetchUsers(1, value, planFilter, statusFilter)
    }, 400)
  }

  function handleFilterChange() {
    setPage(1)
    void fetchUsers(1, search, planFilter, statusFilter)
  }

  async function handleSuspend(userId: string, suspend: boolean, reason: string) {
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/moderation/users/${userId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend, reason: reason || undefined }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: string | { message?: string } }
        const msg = typeof data.error === 'string' ? data.error : (data.error?.message ?? 'Erro ao alterar status.')
        setError(msg)
        return
      }
      setSuccess(suspend ? 'Usuário suspenso com sucesso.' : 'Usuário reativado com sucesso.')
      setSuspendTarget(null)
      void fetchUsers(page, search, planFilter, statusFilter)
    } catch {
      setError('Erro de conexão.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleResetBalance(userId: string) {
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/reset-balance`, { method: 'POST' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } }
        setError(data.error?.message ?? 'Erro ao resetar saldo.')
        return
      }
      setSuccess('Saldo resetado com sucesso.')
      setResetBalanceTarget(null)
      void fetchUsers(page, search, planFilter, statusFilter)
    } catch {
      setError('Erro de conexão.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      {suspendTarget && (
        <SuspendDialog
          user={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onConfirm={handleSuspend}
          isSaving={isSaving}
        />
      )}
      {resetBalanceTarget && (
        <ResetBalanceDialog
          user={resetBalanceTarget}
          onClose={() => setResetBalanceTarget(null)}
          onConfirm={handleResetBalance}
          isSaving={isSaving}
        />
      )}

      {error && (
        <p className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>
      )}
      {success && (
        <p className="rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">
          {success}
        </p>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              type="search"
              placeholder="Buscar por nome ou e-mail..."
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 py-2 pl-8 pr-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#F0B90B]"
            />
          </div>

          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value as PlanType | ''); handleFilterChange() }}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
          >
            <option value="">Todos os planos</option>
            <option value="JOGADOR">Jogador</option>
            <option value="CRAQUE">Craque</option>
            <option value="LENDA">Lenda</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as UserStatus | ''); handleFilterChange() }}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
          >
            <option value="">Todos os status</option>
            <option value={USER_STATUS.ACTIVE}>Ativo</option>
            <option value={USER_STATUS.SUSPENDED}>Suspenso</option>
            <option value={USER_STATUS.BANNED}>Banido</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <p className="text-xs text-zinc-500">
            {isLoading ? 'Carregando...' : `${meta.total} jogador${meta.total !== 1 ? 'es' : ''}`}
          </p>
          {meta.totalPages > 1 && (
            <p className="text-xs text-zinc-500">
              Página {meta.page} de {meta.totalPages}
            </p>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Lista de jogadores">
            <thead className="hidden border-b border-zinc-800 text-left text-xs text-zinc-500 md:table-header-group">
              <tr>
                <th className="px-3 py-3 font-medium">Jogador</th>
                <th className="px-3 py-3 font-medium">Plano</th>
                <th className="px-3 py-3 font-medium">Saldo FS$</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Cadastro</th>
                <th className="px-3 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="skeleton h-10 w-full rounded" aria-hidden="true" />
                    </td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
                    Nenhum jogador encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <UserDetailRow
                    key={user.id}
                    user={user}
                    canSuspend={canSuspend}
                    canResetBalance={canResetBalance}
                    isSaving={isSaving}
                    onSuspend={setSuspendTarget}
                    onResetBalance={setResetBalanceTarget}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-zinc-800 px-4 py-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
              aria-label="Página anterior"
            >
              <ChevronLeft size={14} />
            </button>

            {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(page - 2, meta.totalPages - 4))
              const p = start + i
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  disabled={isLoading}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border text-xs disabled:opacity-40 ${
                    p === page
                      ? 'border-[#F0B90B] bg-[#F0B90B]/10 text-[#F0B90B]'
                      : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {p}
                </button>
              )
            })}

            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages || isLoading}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:bg-zinc-800 disabled:opacity-40"
              aria-label="Próxima página"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
