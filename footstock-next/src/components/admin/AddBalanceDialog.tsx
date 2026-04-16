'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2, DollarSign } from 'lucide-react'

interface AddBalanceDialogProps {
  userId: string
  userName: string
  currentBalance: number
  onConfirm: (amount: number) => Promise<void>
  onCancel: () => void
}

export function AddBalanceDialog({ userName, currentBalance, onConfirm, onCancel }: AddBalanceDialogProps) {
  const [amountStr, setAmountStr] = useState('')
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
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  async function handleConfirm() {
    const amount = parseFloat(amountStr.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) {
      setError('Informe um valor positivo.')
      return
    }

    setError('')
    setLoading(true)
    try {
      await onConfirm(amount)
    } catch {
      setError('Erro ao inserir saldo. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const parsedAmount = parseFloat(amountStr.replace(',', '.'))
  const previewBalance = !isNaN(parsedAmount) && parsedAmount > 0
    ? currentBalance + parsedAmount
    : null

  return (
    <div
      role="dialog"
      data-testid="modal-add-balance"
      aria-modal="true"
      aria-labelledby="add-balance-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full sm:max-w-md bg-[#1a1815] sm:rounded-xl border border-[rgba(240,185,11,.2)] p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[rgba(46,189,133,.1)] flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-[#2EBD85]" />
          </div>
          <div>
            <h2 id="add-balance-dialog-title" className="text-base font-semibold text-[#EAECEF]">
              Inserir saldo
            </h2>
            <p className="text-sm text-[#929AA5] mt-0.5">
              Adicionar saldo para <strong className="text-[#c5b99a]">{userName}</strong>
            </p>
          </div>
        </div>

        <div className="bg-[#2B3139] rounded-xl p-4 mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#929AA5]">Saldo atual</span>
            <span className="font-mono text-[#EAECEF]">
              FS$ {currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          {previewBalance !== null && (
            <div className="flex justify-between border-t border-[rgba(240,185,11,.08)] pt-2">
              <span className="text-[#929AA5]">Novo saldo</span>
              <span className="font-mono text-[#2EBD85] font-semibold">
                FS$ {previewBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="add-balance-input" className="block text-xs font-medium text-[#929AA5] mb-1.5">
            Valor a adicionar (FS$) *
          </label>
          <input
            ref={inputRef}
            id="add-balance-input"
            data-testid="modal-add-balance-input"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={amountStr}
            onChange={(e) => {
              setAmountStr(e.target.value)
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

        <p className="text-xs text-[#707A8A] mb-4">
          Esta ação é registrada no log de auditoria.
        </p>

        <div className="flex gap-3 sm:justify-end">
          <button
            type="button"
            data-testid="modal-add-balance-cancel-button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="modal-add-balance-confirm-button"
            onClick={handleConfirm}
            disabled={loading || !amountStr.trim()}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg bg-[#2EBD85] text-sm font-medium text-white hover:bg-[#26a573] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Adicionando...
              </>
            ) : (
              'Confirmar deposito'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
