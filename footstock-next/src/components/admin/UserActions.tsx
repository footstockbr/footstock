'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { MoreVertical, UserX, UserCheck, RefreshCw, Shield } from 'lucide-react'
import { SuspendDialog } from './SuspendDialog'
import { PromoteDialog } from './PromoteDialog'
import { ResetBalanceDialog } from './ResetBalanceDialog'
import type { AdminUserActionItem } from '@/lib/types/admin'

interface UserActionsProps {
  user: AdminUserActionItem
  currentAdminRole?: string | null
  onActionComplete: () => void
}

export function UserActions({ user, currentAdminRole, onActionComplete }: UserActionsProps) {
  const [open, setOpen] = useState(false)
  const [showSuspendDialog, setShowSuspendDialog] = useState(false)
  const [showPromoteDialog, setShowPromoteDialog] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isSuperAdmin = currentAdminRole === 'SUPER_ADMIN'
  const isSuspended = user.status === 'suspended'

  // Fechar menu ao clicar fora + Escape + navegacao por setas
  useEffect(() => {
    if (!open) return

    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const menu = menuRef.current?.querySelector('[role="menu"]')
        if (!menu) return
        const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        if (items.length === 0) return
        const currentIndex = items.indexOf(document.activeElement as HTMLElement)
        let nextIndex: number
        if (e.key === 'ArrowDown') {
          nextIndex = currentIndex >= items.length - 1 ? 0 : currentIndex + 1
        } else {
          nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
        }
        items[nextIndex].focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    // Foco no primeiro item do menu ao abrir
    requestAnimationFrame(() => {
      const menu = menuRef.current?.querySelector('[role="menu"]')
      if (menu) {
        const firstItem = menu.querySelector<HTMLElement>('[role="menuitem"]')
        firstItem?.focus()
      }
    })

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  async function executeResetBalance() {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/users/${user.id}/reset-balance`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        toast.error(body?.message ?? `Erro ao resetar saldo (${res.status})`)
        return
      }
      const body = await res.json().catch(() => null)
      const newBalance = body?.data?.fsBalance ?? body?.fsBalance
      toast.success(
        newBalance !== undefined
          ? `Saldo de ${user.name} resetado para FS$ ${Number(newBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          : `Saldo de ${user.name} resetado com sucesso.`
      )
      onActionComplete()
    } catch {
      toast.error('Erro de conexão ao resetar saldo. Tente novamente.')
    } finally {
      setLoading(false)
      setShowResetDialog(false)
    }
  }

  async function handleSuspend(reason: string) {
    try {
      const res = await fetch(`/api/v1/admin/users/${user.id}/suspend`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = body?.message ?? `Erro ao suspender usuário (${res.status})`
        window.alert(message)
        return
      }
      setShowSuspendDialog(false)
      onActionComplete()
    } catch {
      window.alert('Erro de conexão ao suspender usuário. Tente novamente.')
    }
  }

  async function handleUnsuspend() {
    setOpen(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/admin/users/${user.id}/suspend`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = body?.message ?? `Erro ao reativar conta (${res.status})`
        window.alert(message)
        return
      }
      onActionComplete()
    } catch {
      window.alert('Erro de conexão ao reativar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div data-testid="admin-user-actions" className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={loading}
        aria-label={`Ações para ${user.name}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="p-2 rounded hover:bg-[rgba(240,185,11,.08)] text-[#929AA5] hover:text-[#F0B90B] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-52 bg-[#1e1a16] border border-[rgba(240,185,11,.15)] rounded-xl shadow-lg z-20 py-1"
        >
          {/* Reset balance */}
          <button
            role="menuitem"
            onClick={() => { setOpen(false); setShowResetDialog(true) }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#c5b99a] hover:bg-[rgba(240,185,11,.06)] min-h-[44px]"
          >
            <RefreshCw className="h-4 w-4 text-[#F0B90B]" />
            Resetar saldo
          </button>

          {/* Suspend / Unsuspend */}
          {isSuspended ? (
            <button
              role="menuitem"
              onClick={handleUnsuspend}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#4ade80] hover:bg-[rgba(74,222,128,.06)] min-h-[44px]"
            >
              <UserCheck className="h-4 w-4" />
              Reativar conta
            </button>
          ) : (
            <button
              role="menuitem"
              data-testid="admin-user-suspend-button"
              onClick={() => { setOpen(false); setShowSuspendDialog(true) }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#F6465D] hover:bg-[rgba(239,68,68,.06)] min-h-[44px]"
            >
              <UserX className="h-4 w-4" />
              Suspender conta
            </button>
          )}

          {/* Promote — apenas SuperAdmin */}
          {isSuperAdmin && (
            <button
              role="menuitem"
              data-testid="admin-user-promote-button"
              onClick={() => {
                setOpen(false)
                setShowPromoteDialog(true)
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-[#c5b99a] hover:bg-[rgba(240,185,11,.06)] min-h-[44px]"
            >
              <Shield className="h-4 w-4 text-[#F0B90B]" />
              Alterar role admin
            </button>
          )}
        </div>
      )}

      {showSuspendDialog && (
        <SuspendDialog
          userId={user.id}
          userName={user.name}
          onConfirm={handleSuspend}
          onCancel={() => setShowSuspendDialog(false)}
        />
      )}

      {showPromoteDialog && (
        <PromoteDialog
          userId={user.id}
          userName={user.name}
          currentRole={user.adminRole}
          onConfirm={() => {
            setShowPromoteDialog(false)
            onActionComplete()
          }}
          onCancel={() => setShowPromoteDialog(false)}
        />
      )}

      {/* T-019: modal de confirmacao de reset de saldo */}
      {showResetDialog && (
        <ResetBalanceDialog
          userId={user.id}
          userName={user.name}
          planType={user.planType ?? 'JOGADOR'}
          currentBalance={user.fsBalance ?? 0}
          onConfirm={executeResetBalance}
          onCancel={() => setShowResetDialog(false)}
        />
      )}
    </div>
  )
}
