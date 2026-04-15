'use client'

import { useState } from 'react'
import { Loader2, Shield } from 'lucide-react'

type AdminRole = 'EDITOR' | 'MODERADOR' | 'ADMINISTRADOR'

const ADMIN_ROLES: { value: AdminRole; label: string }[] = [
  { value: 'EDITOR', label: 'Editor' },
  { value: 'MODERADOR', label: 'Moderador' },
  { value: 'ADMINISTRADOR', label: 'Administrador' },
]

interface PromoteDialogProps {
  userId: string
  userName: string
  currentRole?: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function PromoteDialog({ userId: _userId, userName, currentRole, onConfirm, onCancel }: PromoteDialogProps) {
  const initialRole = ADMIN_ROLES.find((r) => r.value === currentRole)?.value ?? 'EDITOR'
  const [selectedRole, setSelectedRole] = useState<AdminRole>(initialRole)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/users/${_userId}/promote`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = body?.message ?? `Erro ao alterar role (${res.status})`
        setError(message)
        return
      }

      onConfirm()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      data-testid="modal-promote-user"
      aria-modal="true"
      aria-labelledby="promote-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full sm:max-w-md bg-[#1a1815] sm:rounded-xl border border-[rgba(240,185,11,.2)] p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[rgba(240,185,11,.1)] flex items-center justify-center">
            <Shield className="h-5 w-5 text-[#F0B90B]" />
          </div>
          <div>
            <h2 id="promote-dialog-title" className="text-base font-semibold text-[#EAECEF]">
              Alterar role admin
            </h2>
            <p className="text-sm text-[#929AA5] mt-0.5">
              Alterar permissão de <strong className="text-[#c5b99a]">{userName}</strong>.
              {currentRole && (
                <span> Role atual: <strong className="text-[#c5b99a]">{currentRole}</strong></span>
              )}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="promote-role" className="block text-xs font-medium text-[#929AA5] mb-1.5">
            Novo role *
          </label>
          <select
            id="promote-role"
            data-testid="modal-promote-role-select"
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value as AdminRole)
              if (error) setError('')
            }}
            disabled={loading}
            className={[
              'h-10 w-full rounded-lg border bg-[#181A20] px-3 text-sm text-[#EAECEF]',
              'focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
              error ? 'border-[#F6465D]' : 'border-[rgba(240,185,11,.18)] focus:border-[#F0B90B]',
            ].join(' ')}
          >
            {ADMIN_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
          {error && (
            <span className="mt-1 block text-xs text-[#F6465D]" role="alert">
              {error}
            </span>
          )}
        </div>

        <div className="flex gap-3 sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="modal-promote-confirm-button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg bg-[#F0B90B] text-sm font-medium text-[#0c0b09] hover:bg-[#b8972f] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              'Confirmar alteração'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
