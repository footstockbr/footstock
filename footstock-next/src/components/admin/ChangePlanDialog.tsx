'use client'

import { useState } from 'react'
import { Loader2, CreditCard } from 'lucide-react'

type PlanType = 'JOGADOR' | 'CRAQUE' | 'LENDA'

const PLANS: { value: PlanType; label: string }[] = [
  { value: 'JOGADOR', label: 'Jogador' },
  { value: 'CRAQUE', label: 'Craque' },
  { value: 'LENDA', label: 'Lenda' },
]

interface ChangePlanDialogProps {
  userId: string
  userName: string
  currentPlan?: string | null
  onConfirm: (newPlan: PlanType) => Promise<void>
  onCancel: () => void
}

export function ChangePlanDialog({ userName, currentPlan, onConfirm, onCancel }: ChangePlanDialogProps) {
  const initial = PLANS.find((p) => p.value === currentPlan)?.value ?? 'JOGADOR'
  const [selectedPlan, setSelectedPlan] = useState<PlanType>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    if (selectedPlan === currentPlan) {
      setError('Plano selecionado e o mesmo atual.')
      return
    }

    setError('')
    setLoading(true)
    try {
      await onConfirm(selectedPlan)
    } catch {
      setError('Erro ao alterar plano. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      data-testid="modal-change-plan"
      aria-modal="true"
      aria-labelledby="change-plan-dialog-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full sm:max-w-md bg-[#1a1815] sm:rounded-xl border border-[rgba(240,185,11,.2)] p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[rgba(240,185,11,.1)] flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-[#F0B90B]" />
          </div>
          <div>
            <h2 id="change-plan-dialog-title" className="text-base font-semibold text-[#EAECEF]">
              Trocar plano
            </h2>
            <p className="text-sm text-[#929AA5] mt-0.5">
              Alterar plano de <strong className="text-[#c5b99a]">{userName}</strong>.
              {currentPlan && (
                <span> Plano atual: <strong className="text-[#c5b99a]">{currentPlan}</strong></span>
              )}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="change-plan-select" className="block text-xs font-medium text-[#929AA5] mb-1.5">
            Novo plano *
          </label>
          <select
            id="change-plan-select"
            data-testid="modal-change-plan-select"
            value={selectedPlan}
            onChange={(e) => {
              setSelectedPlan(e.target.value as PlanType)
              if (error) setError('')
            }}
            disabled={loading}
            className={[
              'h-10 w-full rounded-lg border bg-[#181A20] px-3 text-sm text-[#EAECEF]',
              'focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed',
              error ? 'border-[#F6465D]' : 'border-[rgba(240,185,11,.18)] focus:border-[#F0B90B]',
            ].join(' ')}
          >
            {PLANS.map((plan) => (
              <option key={plan.value} value={plan.value}>
                {plan.label}
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
            data-testid="modal-change-plan-cancel-button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 sm:flex-none h-10 px-4 rounded-lg border border-[rgba(240,185,11,.18)] text-sm text-[#929AA5] hover:text-[#EAECEF] disabled:opacity-50 min-h-[44px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            data-testid="modal-change-plan-confirm-button"
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
              'Confirmar troca'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
