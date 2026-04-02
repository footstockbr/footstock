'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { RegularUser } from './types'
import { USER_STATUS } from '@/lib/enums'

interface SuspendDialogProps {
  user: RegularUser
  onClose: () => void
  onConfirm: (userId: string, suspend: boolean, reason: string) => Promise<void>
  isSaving: boolean
}

export function SuspendDialog({ user, onClose, onConfirm, isSaving }: SuspendDialogProps) {
  const [reason, setReason] = useState('')
  const isSuspended = user.status === USER_STATUS.SUSPENDED
  const canSubmit = isSuspended || reason.trim().length > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    void onConfirm(user.id, !isSuspended, reason.trim())
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suspend-dialog-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6">
        <div className="mb-4 flex items-start justify-between">
          <h4 id="suspend-dialog-title" className="text-base font-semibold text-zinc-100">
            {isSuspended ? 'Reativar usuário' : 'Suspender usuário'}
          </h4>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:text-zinc-100"
            aria-label="Fechar"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-sm text-zinc-400">
          {isSuspended
            ? <><span>Reativar a conta de </span><strong className="text-zinc-200">{user.name}</strong>?</>
            : <><span>Suspender temporariamente a conta de </span><strong className="text-zinc-200">{user.name}</strong>?</>
          }
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isSuspended && (
            <div>
              <label htmlFor="suspend-reason" className="mb-1.5 block text-xs font-medium text-zinc-300">
                Motivo da suspensão <span className="text-red-400">*</span>
              </label>
              <textarea
                id="suspend-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva o motivo da suspensão..."
                required
                className="w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#F0B90B]"
              />
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 min-h-[40px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || !canSubmit}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold min-h-[40px] disabled:opacity-50 ${
                isSuspended
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-orange-600 text-white hover:bg-orange-700'
              }`}
            >
              {isSaving ? 'Salvando...' : isSuspended ? 'Reativar' : 'Suspender'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
