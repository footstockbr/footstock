'use client'

// T-019: Modal de confirmacao de reset de saldo pelo admin
import { useState } from 'react'

const PLAN_DEFAULT_BALANCE: Record<string, number> = {
  JOGADOR: 2000,
  CRAQUE: 5000,
  LENDA: 25000,
}

interface ResetBalanceDialogProps {
  userId: string
  userName: string
  planType: string
  currentBalance: number
  onConfirm: () => void
  onCancel: () => void
}

export function ResetBalanceDialog({
  userName,
  planType,
  currentBalance,
  onConfirm,
  onCancel,
}: ResetBalanceDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const defaultBalance = PLAN_DEFAULT_BALANCE[planType] ?? 0

  async function handleConfirm() {
    setIsSubmitting(true)
    try {
      onConfirm()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reset-balance-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm mx-4 bg-[#1E2329] border border-[rgba(240,185,11,.15)] rounded-2xl p-6 shadow-2xl">
        <h2
          id="reset-balance-dialog-title"
          className="text-[#EAECEF] font-semibold text-base mb-1"
        >
          Confirmar reset de saldo
        </h2>
        <p className="text-sm text-[#929AA5] mb-5">
          Resetar saldo de <span className="text-[#EAECEF] font-medium">{userName}</span>
        </p>

        <div className="bg-[#2B3139] rounded-xl p-4 mb-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[#929AA5]">Saldo atual</span>
            <span className={`font-mono ${currentBalance <= 0 ? 'text-[#F6465D]' : 'text-[#EAECEF]'}`}>
              FS$ {currentBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#929AA5]">Plano</span>
            <span className="text-[#F0B90B] font-medium">{planType}</span>
          </div>
          <div className="flex justify-between border-t border-[rgba(240,185,11,.08)] pt-2">
            <span className="text-[#929AA5]">Novo saldo</span>
            <span className="font-mono text-[#2EBD85] font-semibold">
              FS$ {defaultBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <p className="text-xs text-[#707A8A] mb-5">
          Esta acao e registrada no log de auditoria. O usuario sera notificado.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl border border-[rgba(240,185,11,.2)] text-sm text-[#929AA5] hover:text-[#EAECEF] hover:border-[rgba(240,185,11,.4)] transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-[#F0B90B] text-[#0B0E11] font-semibold text-sm hover:bg-[#FFD33D] transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Resetando...' : `Resetar para FS$ ${defaultBalance.toLocaleString('pt-BR')}`}
          </button>
        </div>
      </div>
    </div>
  )
}
