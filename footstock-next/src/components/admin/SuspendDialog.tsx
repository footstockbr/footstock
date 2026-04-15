'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { z } from 'zod'
import { Loader2, AlertTriangle } from 'lucide-react'

interface SuspendDialogProps {
  userId: string
  userName: string
  onConfirm: (reason: string) => Promise<void>
  onCancel: () => void
}

const reasonSchema = z.string().min(5, 'Mínimo 5 caracteres').max(500, 'Máximo 500 caracteres')

export function SuspendDialog({ userId: _userId, userName, onConfirm, onCancel }: SuspendDialogProps) {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  // Escape para fechar + focus trap
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key === 'Tab') {
        const focusable = ([textareaRef.current, cancelBtnRef.current, confirmBtnRef.current] as Array<HTMLElement | null>).filter(
          (el): el is HTMLElement => el !== null && !el.hasAttribute('disabled')
        )
        if (focusable.length === 0) return
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
        if (e.shiftKey) {
          e.preventDefault()
          const prev = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
          focusable[prev].focus()
        } else {
          e.preventDefault()
          const next = currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1
          focusable[next].focus()
        }
      }
    },
    [onCancel]
  )

  // Foco inicial no textarea + body overflow hidden
  useEffect(() => {
    textareaRef.current?.focus()
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  async function handleConfirm() {
    const result = reasonSchema.safeParse(reason)
    if (!result.success) {
      setError(result.error.issues[0].message)
      return
    }

    setError('')
    setLoading(true)
    try {
      await onConfirm(reason)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      data-testid="modal-suspend-user"
      aria-modal="true"
      aria-labelledby="suspend-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full sm:max-w-md bg-[#1a1815] sm:rounded-xl border border-[rgba(239,68,68,.2)] p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[rgba(239,68,68,.1)] flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-[#F6465D]" />
          </div>
          <div>
            <h2 id="suspend-dialog-title" className="text-base font-semibold text-[#EAECEF]">
              Suspender usuário
            </h2>
            <p className="text-sm text-[#929AA5] mt-0.5">
              O usuário <strong className="text-[#c5b99a]">{userName}</strong> perderá acesso imediato à plataforma.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="suspend-reason" className="block text-xs font-medium text-[#929AA5] mb-1.5">
            Razão da suspensão *
          </label>
          <textarea
            ref={textareaRef}
            id="suspend-reason"
            data-testid="modal-suspend-reason-input"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (error) setError('')
            }}
            disabled={loading}
            rows={3}
            placeholder="Descreva o motivo da suspensão..."
            aria-describedby={error ? 'suspend-reason-error' : undefined}
            className={[
              'w-full rounded-lg border bg-[#181A20] px-3 py-2 text-sm text-[#EAECEF] placeholder:text-[#707A8A]',
              'focus:outline-none resize-none disabled:opacity-50',
              error ? 'border-[#F6465D]' : 'border-[rgba(240,185,11,.18)] focus:border-[#F0B90B]',
            ].join(' ')}
          />
          {error && (
            <span id="suspend-reason-error" className="mt-1 text-xs text-[#F6465D]" role="alert">
              {error}
            </span>
          )}
        </div>

        <div className="flex gap-3 sm:justify-end">
          <button
            ref={cancelBtnRef}
            type="button"
            data-testid="modal-suspend-cancel-button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            ref={confirmBtnRef}
            type="button"
            data-testid="modal-suspend-confirm-button"
            onClick={handleConfirm}
            disabled={loading || !reason.trim()}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg bg-[#F6465D] text-sm font-medium text-white hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Suspendendo...
              </>
            ) : (
              'Confirmar suspensão'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
