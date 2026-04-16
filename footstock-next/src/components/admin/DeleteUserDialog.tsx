'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Trash2 } from 'lucide-react'

interface DeleteUserDialogProps {
  userId: string
  userName: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export function DeleteUserDialog({ userName, onConfirm, onCancel }: DeleteUserDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    },
    [onCancel]
  )

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  async function handleConfirm() {
    setError('')
    setLoading(true)
    try {
      await onConfirm()
    } catch {
      setError('Erro ao deletar conta. Tente novamente.')
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      data-testid="modal-delete-user"
      aria-modal="true"
      aria-labelledby="delete-user-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full sm:max-w-md bg-[#1a1815] sm:rounded-xl border border-[rgba(239,68,68,.2)] p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[rgba(239,68,68,.1)] flex items-center justify-center">
            <Trash2 className="h-5 w-5 text-[#F6465D]" />
          </div>
          <div>
            <h2 id="delete-user-dialog-title" className="text-base font-semibold text-[#EAECEF]">
              Deletar conta
            </h2>
            <p className="text-sm text-[#929AA5] mt-0.5">
              Tem certeza que deseja deletar a conta de <strong className="text-[#c5b99a]">{userName}</strong>?
            </p>
          </div>
        </div>

        <div className="bg-[rgba(239,68,68,.06)] rounded-xl p-4 mb-4 text-sm text-[#F6465D]">
          Esta ação suspende permanentemente a conta do usuário e não pode ser desfeita facilmente.
          O usuário perderá acesso imediato à plataforma.
        </div>

        {error && (
          <span className="mb-3 block text-xs text-[#F6465D]" role="alert">
            {error}
          </span>
        )}

        <div className="flex gap-3 sm:justify-end">
          <button
            type="button"
            data-testid="modal-delete-user-cancel-button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="modal-delete-user-confirm-button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg bg-[#F6465D] text-sm font-medium text-white hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deletando...
              </>
            ) : (
              'Deletar conta'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
