'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2, Pencil } from 'lucide-react'

interface EditNameDialogProps {
  userId: string
  userName: string
  onConfirm: (newName: string) => Promise<void>
  onCancel: () => void
}

export function EditNameDialog({ userName, onConfirm, onCancel }: EditNameDialogProps) {
  const [name, setName] = useState(userName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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
    inputRef.current?.focus()
    inputRef.current?.select()
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  async function handleConfirm() {
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setError('Nome deve ter ao menos 2 caracteres.')
      return
    }
    if (trimmed.length > 120) {
      setError('Nome deve ter no máximo 120 caracteres.')
      return
    }
    if (trimmed === userName) {
      setError('Nome idêntico ao atual.')
      return
    }

    setError('')
    setLoading(true)
    try {
      await onConfirm(trimmed)
    } catch {
      setError('Erro ao salvar nome. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      data-testid="modal-edit-name"
      aria-modal="true"
      aria-labelledby="edit-name-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full sm:max-w-md bg-[#1a1815] sm:rounded-xl border border-[rgba(240,185,11,.2)] p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[rgba(240,185,11,.1)] flex items-center justify-center">
            <Pencil className="h-5 w-5 text-[#F0B90B]" />
          </div>
          <div>
            <h2 id="edit-name-dialog-title" className="text-base font-semibold text-[#EAECEF]">
              Editar nome
            </h2>
            <p className="text-sm text-[#929AA5] mt-0.5">
              Alterar nome de <strong className="text-[#c5b99a]">{userName}</strong>
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="edit-name-input" className="block text-xs font-medium text-[#929AA5] mb-1.5">
            Novo nome *
          </label>
          <input
            ref={inputRef}
            id="edit-name-input"
            data-testid="modal-edit-name-input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError('')
            }}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) handleConfirm()
            }}
            className={[
              'h-10 w-full rounded-lg border bg-[#181A20] px-3 text-sm text-[#EAECEF]',
              'focus:outline-none disabled:opacity-50',
              error ? 'border-[#F6465D]' : 'border-[rgba(240,185,11,.18)] focus:border-[#F0B90B]',
            ].join(' ')}
          />
          {error && (
            <span className="mt-1 block text-xs text-[#F6465D]" role="alert">
              {error}
            </span>
          )}
        </div>

        <div className="flex gap-3 sm:justify-end">
          <button
            type="button"
            data-testid="modal-edit-name-cancel-button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="modal-edit-name-confirm-button"
            onClick={handleConfirm}
            disabled={loading || !name.trim()}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg bg-[#F0B90B] text-sm font-medium text-[#0c0b09] hover:bg-[#b8972f] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar nome'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
