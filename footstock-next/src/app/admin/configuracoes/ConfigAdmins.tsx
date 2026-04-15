'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Edit2, UserMinus, Check, X, AlertTriangle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { AdminRole } from '@/types'

interface AdminUser {
  id: string
  name: string
  email: string
  adminRole: AdminRole | null
  status: string
  planType: string
  createdAt: string
}

// Roles atribuíveis via UI (SUPER_ADMIN só pode ser feito diretamente no DB; CLUB_PARTNER é role especial)
type AssignableRole = 'ADMINISTRADOR' | 'MONITOR' | 'EDITOR' | 'MODERADOR'
const ROLE_OPTIONS: AssignableRole[] = ['ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR']

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'SuperAdmin',
  ADMINISTRADOR: 'Administrador',
  MONITOR: 'Monitor',
  EDITOR: 'Editor',
  MODERADOR: 'Moderador',
}

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN: '#F0B90B',
  ADMINISTRADOR: '#6c63ff',
  MONITOR: '#2EBD85',
  EDITOR: '#00B1EA',
  MODERADOR: '#f97316',
}

async function fetchAdmins(): Promise<AdminUser[]> {
  const res = await fetch('/api/v1/admin/admins', { credentials: 'include' })
  if (!res.ok) throw new Error('Erro ao carregar administradores')
  const { data } = await res.json()
  return data
}

async function createAdmin(body: { email: string; role: AssignableRole }): Promise<AdminUser> {
  const res = await fetch('/api/v1/admin/admins', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error?.message ?? 'Erro ao criar admin')
  }
  const { data } = await res.json()
  return data
}

async function updateAdmin(id: string, body: { role: AssignableRole }): Promise<AdminUser> {
  const res = await fetch(`/api/v1/admin/admins/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error?.message ?? 'Erro ao atualizar admin')
  }
  const { data } = await res.json()
  return data
}

async function deactivateAdmin(id: string): Promise<void> {
  const res = await fetch(`/api/v1/admin/admins/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) {
    const data = await res.json()
    throw new Error(data.error?.message ?? 'Erro ao desativar admin')
  }
}

interface CreateAdminFormProps {
  onSuccess: () => void
  onCancel: () => void
}

function CreateAdminForm({ onSuccess, onCancel }: CreateAdminFormProps) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignableRole>('EDITOR')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createAdmin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-admins-list'] })
      onSuccess()
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Erro ao criar'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Informe o e-mail'); return }
    setError(null)
    mutation.mutate({ email: email.trim().toLowerCase(), role: role as AssignableRole })
  }

  return (
    <form
      data-testid="admin-config-create-admin-form"
      onSubmit={handleSubmit}
      className="bg-[#0B0E11] border border-[rgba(240,185,11,.15)] rounded-xl p-4 space-y-4"
    >
      <p className="text-sm font-bold text-[#EAECEF] flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-[#F0B90B]" />
        Novo administrador
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@footstock.com"
            required
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-sm text-[#EAECEF] placeholder-[#929AA5] focus:outline-none focus:border-[#F0B90B]"
          />
        </div>
        <div>
          <label className="block text-[10px] text-[#929AA5] uppercase tracking-wide mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AssignableRole)}
            className="w-full bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-lg px-3 py-2 text-sm text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-[#F6465D]">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-[#F0B90B] text-[#080b12] rounded-lg text-sm font-bold hover:bg-[#d4a309] transition-colors disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          {mutation.isPending ? 'Criando...' : 'Criar admin'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 bg-[#2B2F36] text-[#929AA5] rounded-lg text-sm font-medium hover:text-[#EAECEF] transition-colors"
        >
          <X className="h-4 w-4" />
          Cancelar
        </button>
      </div>
    </form>
  )
}

interface AdminRowProps {
  admin: AdminUser
  currentAdminId: string
  onRoleChange: (id: string, role: AssignableRole) => void
  onDeactivate: (id: string) => void
  isMutating: boolean
}

function AdminRow({ admin, currentAdminId, onRoleChange, onDeactivate, isMutating }: AdminRowProps) {
  const [editing, setEditing] = useState(false)
  const [newRole, setNewRole] = useState<AssignableRole>((admin.adminRole as AssignableRole) ?? 'EDITOR')
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  const isSelf = admin.id === currentAdminId
  const isSuperAdmin = admin.adminRole === 'SUPER_ADMIN'
  const isInactive = admin.status !== 'ACTIVE'

  const roleColor = ROLE_COLOR[admin.adminRole ?? ''] ?? '#929AA5'

  function handleRoleSave() {
    onRoleChange(admin.id, newRole)
    setEditing(false)
  }

  return (
    <tr
      data-testid={`admin-config-admin-row-${admin.id}`}
      className={cn('border-b border-[rgba(240,185,11,.06)] last:border-0', isInactive && 'opacity-50')}
    >
      <td className="py-3 px-3">
        <div>
          <p className="text-sm font-medium text-[#EAECEF]">{admin.name}</p>
          <p className="text-[11px] text-[#929AA5]">{admin.email}</p>
        </div>
      </td>
      <td className="py-3 px-3">
        {editing && !isSuperAdmin ? (
          <div className="flex items-center gap-2">
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AssignableRole)}
              className="bg-[#0B0E11] border border-[rgba(240,185,11,.15)] rounded px-2 py-1 text-xs text-[#c5b99a] focus:outline-none focus:border-[#F0B90B]"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={isMutating}
              onClick={handleRoleSave}
              className="p-1 text-emerald-400 hover:text-emerald-300"
              aria-label="Salvar role"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="p-1 text-[#929AA5] hover:text-[#EAECEF]"
              aria-label="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span
            className="text-xs font-bold px-2 py-0.5 rounded"
            style={{ color: roleColor, backgroundColor: `${roleColor}22` }}
          >
            {ROLE_LABEL[admin.adminRole ?? ''] ?? admin.adminRole}
          </span>
        )}
      </td>
      <td className="py-3 px-3">
        <span className={cn(
          'text-xs font-medium px-2 py-0.5 rounded',
          isInactive
            ? 'bg-red-500/10 text-red-400'
            : 'bg-emerald-500/10 text-emerald-400'
        )}>
          {isInactive ? 'Inativo' : 'Ativo'}
        </span>
      </td>
      <td className="py-3 px-3 text-[11px] text-[#929AA5]">
        {new Date(admin.createdAt).toLocaleDateString('pt-BR')}
      </td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-1">
          {!editing && !isSuperAdmin && !isInactive && (
            <button
              type="button"
              disabled={isMutating}
              onClick={() => setEditing(true)}
              className="p-1.5 text-[#929AA5] hover:text-[#F0B90B] transition-colors"
              aria-label="Editar role"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          )}
          {!isSelf && !isSuperAdmin && !isInactive && (
            <>
              {confirmDeactivate ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={isMutating}
                    onClick={() => { onDeactivate(admin.id); setConfirmDeactivate(false) }}
                    className="px-2 py-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded hover:bg-red-500/20 transition-colors"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeactivate(false)}
                    className="p-1 text-[#929AA5] hover:text-[#EAECEF]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={() => setConfirmDeactivate(true)}
                  className="p-1.5 text-[#929AA5] hover:text-red-400 transition-colors"
                  aria-label="Desativar admin"
                  title="Desativar admin (preserva histórico)"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
          {isSuperAdmin && (
            <span className="text-[9px] text-[#929AA5] px-1">protegido</span>
          )}
        </div>
      </td>
    </tr>
  )
}

interface ConfigAdminsProps {
  adminId: string
}

export function ConfigAdmins({ adminId }: ConfigAdminsProps) {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  const { data: admins = [], isLoading, error } = useQuery({
    queryKey: ['admin-admins-list'],
    queryFn: fetchAdmins,
    staleTime: 60_000,
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AssignableRole }) => updateAdmin(id, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-admins-list'] })
      setActionSuccess('Role atualizado com sucesso')
      setActionError(null)
      setTimeout(() => setActionSuccess(null), 4000)
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Erro ao atualizar'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateAdmin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-admins-list'] })
      setActionSuccess('Admin desativado — histórico de ações preservado')
      setActionError(null)
      setTimeout(() => setActionSuccess(null), 4000)
    },
    onError: (err) => setActionError(err instanceof Error ? err.message : 'Erro ao desativar'),
  })

  const isMutating = roleMutation.isPending || deactivateMutation.isPending

  if (isLoading) {
    return (
      <div data-testid="admin-config-admins-loading" className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="admin-config-admins-error" className="p-4 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-sm text-[#F6465D]">
        Erro ao carregar lista de administradores
      </div>
    )
  }

  return (
    <div data-testid="admin-config-admins" className="space-y-4">
      {/* Notice */}
      <div className="flex items-start gap-2 p-3 bg-[rgba(240,185,11,.06)] border border-[rgba(240,185,11,.15)] rounded-lg">
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-[#929AA5]">
          Desativar um admin <strong className="text-[#EAECEF]">não apaga</strong> o histórico de ações.
          SUPER_ADMIN não pode ser rebaixado por esta interface.
          Todas as ações aqui são auditadas.
        </p>
      </div>

      {actionSuccess && (
        <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          {actionSuccess}
        </div>
      )}
      {actionError && (
        <div className="p-3 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-lg text-xs text-[#F6465D]">
          {actionError}
        </div>
      )}

      {/* Create button */}
      {!showCreate && (
        <button
          type="button"
          data-testid="admin-config-create-admin-button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[rgba(240,185,11,.08)] text-[#F0B90B] border border-[rgba(240,185,11,.2)] rounded-lg text-sm font-medium hover:bg-[rgba(240,185,11,.15)] transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Novo admin
        </button>
      )}

      {showCreate && (
        <CreateAdminForm
          onSuccess={() => setShowCreate(false)}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Table */}
      <div className="bg-[#1E2329] rounded-xl border border-[rgba(240,185,11,.1)] overflow-hidden">
        <div className="p-3 border-b border-[rgba(240,185,11,.08)]">
          <p className="text-xs font-semibold text-[#929AA5] uppercase tracking-wide">
            {admins.length} administrador{admins.length !== 1 ? 'es' : ''}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px]" data-testid="admin-config-admins-table">
            <thead>
              <tr className="border-b border-[rgba(240,185,11,.08)] text-[#929AA5]">
                <th className="text-left py-2.5 px-3 text-[10px] font-medium uppercase tracking-wide">Admin</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium uppercase tracking-wide">Role</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium uppercase tracking-wide">Status</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium uppercase tracking-wide">Criado em</th>
                <th className="text-left py-2.5 px-3 text-[10px] font-medium uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((admin) => (
                <AdminRow
                  key={admin.id}
                  admin={admin}
                  currentAdminId={adminId}
                  onRoleChange={(id, role) => roleMutation.mutate({ id, role })}
                  onDeactivate={(id) => deactivateMutation.mutate(id)}
                  isMutating={isMutating}
                />
              ))}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-[#929AA5]">
                    Nenhum administrador cadastrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
