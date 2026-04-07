'use client'

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isoToDisplay } from '@/lib/utils/format'
import type { WizardData } from '../register-wizard'

interface Step2AgeConfirmationProps {
  data: WizardData
  onNext: (data: Partial<WizardData>) => void
}

export function Step2AgeConfirmation({ data, onNext }: Step2AgeConfirmationProps) {
  const [confirmed, setConfirmed] = useState(false)

  const displayDate = data.birthDate ? isoToDisplay(data.birthDate) : '—'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!confirmed) return
    onNext({})
  }

  return (
    <form
      data-testid="form-register-step2-age"
      onSubmit={handleSubmit}
      className="flex flex-col gap-5"
      aria-labelledby="wizard-heading"
    >
      {/* Ícone + data exibida */}
      <div className="flex flex-col items-center gap-2 py-2">
        <ShieldCheck className="h-10 w-10 text-[#F0B90B]" aria-hidden="true" />
        <p className="text-xs text-[#929AA5]">Data de nascimento informada</p>
        <p
          data-testid="age-confirmation-display-date"
          className="text-2xl font-bold text-[#EAECEF] tracking-widest"
        >
          {displayDate}
        </p>
      </div>

      {/* Declaração */}
      <div className="bg-[#1E2329] border border-[rgba(240,185,11,.18)] rounded-lg p-4">
        <label
          htmlFor="age-declaration"
          className="flex items-start gap-3 cursor-pointer min-h-[44px]"
        >
          <input
            id="age-declaration"
            data-testid="age-declaration-checkbox"
            type="checkbox"
            checked={confirmed}
            onChange={() => setConfirmed((v) => !v)}
            required
            className="mt-0.5 accent-[#F0B90B] w-4 h-4 flex-shrink-0"
            aria-required="true"
          />
          <span className="text-sm text-[#EAECEF] leading-relaxed">
            Declaro que a data de nascimento informada acima é verdadeira e que sou maior de 18 anos.
            Estou ciente de que informações falsas podem resultar no cancelamento imediato da minha conta.
            <span className="text-[#F6465D] ml-1" aria-hidden="true">*</span>
          </span>
        </label>
      </div>

      <p className="text-xs text-[#707A8A] text-center px-2">
        Se a data estiver incorreta, volte à etapa anterior para corrigi-la.
      </p>

      <Button
        data-testid="form-register-step2-age-next-button"
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={!confirmed}
        aria-disabled={!confirmed}
        className="mt-2"
      >
        Confirmar e continuar →
      </Button>
    </form>
  )
}
