'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { PLAN_LABELS } from '@/lib/constants/labels'
import { PLAN_BADGE, STATUS_BADGE, STATUS_LABELS } from './types'
import type { RegularUser } from './types'
import { USER_STATUS } from '@/lib/enums'

interface UserDetailRowProps {
  user: RegularUser
  canSuspend: boolean
  canResetBalance: boolean
  isSaving: boolean
  onSuspend: (user: RegularUser) => void
  onResetBalance: (user: RegularUser) => void
}

export function UserDetailRow({ user, canSuspend, canResetBalance, isSaving, onSuspend, onResetBalance }: UserDetailRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      {/* Desktop row */}
      <tr className="hidden border-b border-zinc-800/70 text-zinc-200 hover:bg-zinc-800/20 md:table-row">
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-300">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">{user.name}</p>
              <p className="text-xs text-zinc-500">{user.email}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3">
          <span className={`rounded border px-2 py-0.5 text-xs font-medium ${PLAN_BADGE[user.planType]}`}>
            {PLAN_LABELS[user.planType]}
          </span>
        </td>
        <td className="px-3 py-3 text-sm text-zinc-300">
          FS$ {user.fsBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </td>
        <td className="px-3 py-3">
          <span className={`rounded border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[user.status]}`}>
            {STATUS_LABELS[user.status]}
          </span>
        </td>
        <td className="px-3 py-3 text-xs text-zinc-500">
          {new Date(user.createdAt).toLocaleDateString('pt-BR')}
        </td>
        <td className="px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {canSuspend && (
              <button
                onClick={() => onSuspend(user)}
                disabled={isSaving || user.status === USER_STATUS.BANNED}
                title={user.status === USER_STATUS.BANNED ? 'Usuário banido — use a aba Administradores' : undefined}
                className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                  user.status === USER_STATUS.SUSPENDED
                    ? 'border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20'
                    : 'border-orange-700/50 text-orange-400 hover:bg-orange-900/20'
                }`}
              >
                {user.status === USER_STATUS.SUSPENDED ? 'Reativar' : 'Suspender'}
              </button>
            )}
            {canResetBalance && (
              <button
                onClick={() => onResetBalance(user)}
                disabled={isSaving}
                className="rounded border border-red-900/60 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-900/20 disabled:opacity-40"
              >
                Reset Saldo
              </button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800"
              aria-expanded={expanded}
            >
              Detalhes
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
        </td>
      </tr>

      {/* Desktop expanded detail */}
      {expanded && (
        <tr className="hidden border-b border-zinc-800/70 bg-zinc-800/20 md:table-row">
          <td colSpan={6} className="px-4 py-3">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-zinc-500">ID</dt>
                <dd className="font-mono text-zinc-300 break-all">{user.id}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">E-mail</dt>
                <dd className="text-zinc-300 break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Plano</dt>
                <dd className="text-zinc-300">{PLAN_LABELS[user.planType]}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Status</dt>
                <dd className="text-zinc-300">{STATUS_LABELS[user.status]}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Saldo FS$</dt>
                <dd className="text-zinc-300">
                  {user.fsBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Cadastro</dt>
                <dd className="text-zinc-300">
                  {new Date(user.createdAt).toLocaleString('pt-BR')}
                </dd>
              </div>
            </dl>
          </td>
        </tr>
      )}

      {/* Mobile card */}
      <tr className="border-b border-zinc-800/70 md:hidden">
        <td colSpan={6} className="p-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-sm font-semibold text-zinc-300">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{user.name}</p>
                  <p className="truncate text-xs text-zinc-500">{user.email}</p>
                </div>
              </div>
              <span className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[user.status]}`}>
                {STATUS_LABELS[user.status]}
              </span>
            </div>
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              <span className={`rounded border px-2 py-0.5 text-xs font-medium ${PLAN_BADGE[user.planType]}`}>
                {PLAN_LABELS[user.planType]}
              </span>
              <span className="text-xs text-zinc-400">
                FS$ {user.fsBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-zinc-600">
                {new Date(user.createdAt).toLocaleDateString('pt-BR')}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSuspend && (
                <button
                  onClick={() => onSuspend(user)}
                  disabled={isSaving || user.status === USER_STATUS.BANNED}
                  className={`rounded border px-3 py-1.5 text-xs font-medium min-h-[36px] disabled:opacity-40 ${
                    user.status === USER_STATUS.SUSPENDED
                      ? 'border-emerald-700/50 text-emerald-400'
                      : 'border-orange-700/50 text-orange-400'
                  }`}
                >
                  {user.status === USER_STATUS.SUSPENDED ? 'Reativar' : 'Suspender'}
                </button>
              )}
              {canResetBalance && (
                <button
                  onClick={() => onResetBalance(user)}
                  disabled={isSaving}
                  className="rounded border border-red-900/60 px-3 py-1.5 text-xs font-medium text-red-400 min-h-[36px] disabled:opacity-40"
                >
                  Reset Saldo
                </button>
              )}
              <button
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 min-h-[36px]"
                aria-expanded={expanded}
              >
                Detalhes
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
            {expanded && (
              <dl className="mt-3 space-y-1 border-t border-zinc-700 pt-3 text-xs">
                <div className="flex gap-2">
                  <dt className="w-14 shrink-0 text-zinc-500">ID</dt>
                  <dd className="font-mono text-zinc-300 break-all">{user.id}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-14 shrink-0 text-zinc-500">Cadastro</dt>
                  <dd className="text-zinc-300">{new Date(user.createdAt).toLocaleString('pt-BR')}</dd>
                </div>
              </dl>
            )}
          </div>
        </td>
      </tr>
    </>
  )
}
