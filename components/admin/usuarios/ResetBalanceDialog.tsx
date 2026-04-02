'use client'

import { X } from 'lucide-react'
import type { RegularUser } from './types'

interface ResetBalanceDialogProps {
  user: RegularUser
  onClose: () => void
  onConfirm: (userId: string) => Promise<void>
  isSaving: boolean
}

export function ResetBalanceDialog({ user, onClose, onConfirm, isSaving }: ResetBalanceDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-balance-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6">
        <div className="mb-4 flex items-start justify-between">
          <h4 id="reset-balance-title" className="text-base font-semibold text-zinc-100">
            Resetar saldo
          </h4>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-100" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <p className="mb-2 text-sm text-zinc-400">
          Zerar o saldo FS$ de <strong className="text-zinc-200">{user.name}</strong>?
        </p>
        <p className="mb-5 text-xs text-amber-400/80">
          Saldo atual: <strong>FS$ {user.fsBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>.
          Esta ação é irreversível e será registrada no audit log.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            onClick={() => void onConfirm(user.id)}
            disabled={isSaving}
            className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 min-h-[40px]"
          >
            {isSaving ? 'Resetando...' : 'Confirmar reset'}
          </button>
        </div>
      </div>
    </div>
  )
}
