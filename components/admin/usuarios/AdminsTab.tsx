'use client'

import { useEffect, useMemo, useState } from 'react'
import { ROLES } from './types'
import type { AdminRole, AdminUser } from './types'
import { USER_STATUS } from '@/lib/enums'

interface AdminsTabProps {
  sessionRole: AdminRole | null
  isSuperAdmin: boolean
}

export function AdminsTab({ sessionRole: _sessionRole, isSuperAdmin }: AdminsTabProps) {
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<AdminRole>('ADMINISTRADOR')
  const [roleByUserId, setRoleByUserId] = useState<Record<string, AdminRole>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function loadData() {
    setError(null)
    setSuccess(null)
    setIsLoading(true)
    try {
      const res = await fetch('/api/v1/admin/admins')
      if (!res.ok) {
        setError('Nao foi possivel carregar a lista de administradores.')
        return
      }
      const json = (await res.json()) as { data?: AdminUser[] }
      const list = json.data ?? []
      setAdmins(list)
      setRoleByUserId(
        Object.fromEntries(
          list
            .filter((item): item is AdminUser & { adminRole: AdminRole } => item.adminRole !== null)
            .map((item) => [item.id, item.adminRole]),
        ),
      )
    } catch {
      setError('Erro de conexao ao carregar os administradores.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  const sortedAdmins = useMemo(
    () => [...admins].sort((a, b) => `${a.adminRole ?? ''}${a.email}`.localeCompare(`${b.adminRole ?? ''}${b.email}`)),
    [admins],
  )

  async function handleCreateAdmin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/v1/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role: newRole }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } }
        setError(data.error?.message ?? 'Falha ao promover usuario para admin.')
        return
      }
      setSuccess('Administrador atualizado com sucesso.')
      setEmail('')
      await loadData()
    } catch {
      setError('Erro de conexao ao promover administrador.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUpdateRole(userId: string) {
    const role = roleByUserId[userId]
    if (!role) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/admins/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } }
        setError(data.error?.message ?? 'Falha ao alterar role do administrador.')
        return
      }
      setSuccess('Role administrativa atualizada.')
      await loadData()
    } catch {
      setError('Erro de conexao ao atualizar role administrativa.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemoveAdmin(userId: string) {
    if (!confirm('Remover acesso admin deste usuario?')) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/admins/${userId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } }
        setError(data.error?.message ?? 'Falha ao remover acesso admin.')
        return
      }
      setSuccess('Acesso admin removido com sucesso.')
      await loadData()
    } catch {
      setError('Erro de conexao ao remover acesso admin.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleBan(userId: string, userName: string, currentStatus: string) {
    const isBanned = currentStatus === 'BANNED'
    if (isBanned) {
      if (!confirm(`Remover banimento de "${userName}"? O usuario voltara ao status ACTIVE.`)) return
      setIsSaving(true)
      setError(null)
      setSuccess(null)
      try {
        const res = await fetch(`/api/v1/admin/users/${userId}/ban`, { method: 'DELETE' })
        if (!res.ok) {
          const data = (await res.json()) as { error?: { message?: string } }
          setError(data.error?.message ?? 'Falha ao remover banimento.')
          return
        }
        setSuccess(`Banimento de "${userName}" removido.`)
        await loadData()
      } catch {
        setError('Erro de conexao ao remover banimento.')
      } finally {
        setIsSaving(false)
      }
      return
    }
    const reason = prompt(`Motivo do banimento de "${userName}" (obrigatorio):`)
    if (!reason?.trim()) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } }
        setError(data.error?.message ?? 'Falha ao banir usuario.')
        return
      }
      setSuccess(`"${userName}" banido com sucesso.`)
      await loadData()
    } catch {
      setError('Erro de conexao ao banir usuario.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDeleteAccount(userId: string, userName: string) {
    if (!confirm(`ATENCAO: Esta acao e permanente e irreversivel.\n\nExcluir a conta de "${userName}"?\n\nOs dados pessoais serao anonimizados (LGPD). Registros financeiros sao mantidos por obrigacao legal.`)) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } }
        setError(data.error?.message ?? 'Falha ao excluir conta do usuario.')
        return
      }
      setSuccess(`Conta de "${userName}" excluida e dados anonimizados com sucesso.`)
      await loadData()
    } catch {
      setError('Erro de conexao ao excluir conta.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      {success && <p className="rounded-md border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300">{success}</p>}

      {isSuperAdmin && (
        <form onSubmit={(e) => void handleCreateAdmin(e)} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-sm font-semibold text-zinc-200">Promover usuario para admin</h2>
          <p className="mt-1 text-xs text-amber-400/80">
            Nota: ao promover um usuario para admin, o plano de assinatura dele sera alterado automaticamente para{' '}
            <strong>Jogador (gratuito)</strong>. Assinaturas ativas serao mantidas ate o vencimento, mas o acesso premium sera removido ao expirar.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-[2fr_1fr_auto]">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="email@dominio.com"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
              required
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AdminRole)}
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-[#F0B90B]"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-[#F0B90B] px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-60"
            >
              Promover
            </button>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">Administradores cadastrados</h2>
        {isLoading ? (
          <p className="mt-3 text-sm text-zinc-400">Carregando...</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-400">
                  <th className="px-2 py-2">Nome</th>
                  <th className="px-2 py-2">E-mail</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Plano</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {sortedAdmins.map((admin) => {
                  const selectedRole = roleByUserId[admin.id] ?? 'MONITOR'
                  return (
                    <tr key={admin.id} className="border-b border-zinc-800/70 text-zinc-200">
                      <td className="px-2 py-2">{admin.name}</td>
                      <td className="px-2 py-2">{admin.email}</td>
                      <td className="px-2 py-2">
                        <select
                          value={selectedRole}
                          onChange={(e) => setRoleByUserId((prev) => ({ ...prev, [admin.id]: e.target.value as AdminRole }))}
                          disabled={!isSuperAdmin || isSaving}
                          className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 disabled:opacity-70"
                        >
                          {ROLES.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">{admin.planType}</td>
                      <td className="px-2 py-2">{admin.status}</td>
                      <td className="px-2 py-2">
                        {isSuperAdmin ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => void handleUpdateRole(admin.id)}
                              disabled={isSaving}
                              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 disabled:opacity-60"
                            >
                              Salvar role
                            </button>
                            <button
                              onClick={() => void handleRemoveAdmin(admin.id)}
                              disabled={isSaving}
                              className="rounded-md border border-red-800 px-2 py-1 text-xs text-red-300 disabled:opacity-60"
                            >
                              Remover admin
                            </button>
                            <button
                              onClick={() => void handleBan(admin.id, admin.name, admin.status)}
                              disabled={isSaving}
                              title={admin.status === USER_STATUS.BANNED ? 'Remover banimento' : 'Banir permanentemente'}
                              className={`rounded-md border px-2 py-1 text-xs disabled:opacity-60 ${admin.status === USER_STATUS.BANNED ? 'border-amber-700 text-amber-400 hover:border-amber-500' : 'border-orange-900 text-orange-400 hover:border-orange-700'}`}
                            >
                              {admin.status === USER_STATUS.BANNED ? 'Desbanir' : 'Banir'}
                            </button>
                            <button
                              onClick={() => void handleDeleteAccount(admin.id, admin.name)}
                              disabled={isSaving}
                              title="Excluir conta permanentemente (LGPD)"
                              className="rounded-md border border-red-950 bg-red-950/30 px-2 py-1 text-xs text-red-400 hover:border-red-700 hover:text-red-300 disabled:opacity-60"
                            >
                              Excluir conta
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-500">Somente SUPER_ADMIN</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
