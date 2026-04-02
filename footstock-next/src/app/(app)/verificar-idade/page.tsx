'use client'

import { useEffect, useState } from 'react'
import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import type { Metadata } from 'next'
import { Shield } from 'lucide-react'
import Link from 'next/link'
import { ROUTES } from '@/lib/constants/routes'
import { verifyAgeAction } from '@/actions/age-verification'
import { initialActionState } from '@/lib/action-utils'
import { maskDateInput, displayToIso } from '@/lib/utils/format'

export default function VerificarIdadePage() {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(
    verifyAgeAction,
    initialActionState
  )
  const [birthDisplay, setBirthDisplay] = useState('')
  const birthIso = displayToIso(birthDisplay)

  useEffect(() => {
    if (state.success) {
      router.replace(ROUTES.MERCADO)
    }
  }, [state.success, router])

  return (
    <div className="min-h-dvh bg-[#0B0E11] flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-[rgba(240,185,11,.12)] flex items-center justify-center">
        <Shield className="h-8 w-8 text-[#F0B90B]" aria-hidden="true" />
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[#EAECEF] mb-2">Verificação de Idade</h1>
        <p className="text-sm text-[#929AA5] max-w-xs">
          O Foot Stock é destinado a maiores de 18 anos. Confirme sua data de nascimento para continuar.
        </p>
      </div>

      <form action={formAction} className="w-full max-w-xs space-y-4">
        <div>
          <label
            htmlFor="birthDate"
            className="block text-xs font-medium text-[#929AA5] mb-1.5 text-left uppercase tracking-wide"
          >
            Data de Nascimento
          </label>
          {/* hidden input envia ISO (YYYY-MM-DD) para o Server Action */}
          <input type="hidden" name="birthDate" value={birthIso} />
          <input
            id="birthDate"
            type="text"
            placeholder="dd/mm/aaaa"
            inputMode="numeric"
            maxLength={10}
            value={birthDisplay}
            onChange={(e) => setBirthDisplay(maskDateInput(e.target.value))}
            required
            aria-required="true"
            aria-describedby={
              !state.success && state.error ? 'age-error' : undefined
            }
            aria-invalid={!state.success && !!state.error}
            className="h-11 w-full rounded-lg border border-[rgba(240,185,11,.18)] bg-[#181A20] px-3 text-sm text-[#EAECEF] focus:outline-none focus:border-[rgba(240,185,11,.4)] focus:ring-1 focus:ring-[rgba(240,185,11,.3)]"
          />
          {!state.success && state.error && (
            <p
              id="age-error"
              role="alert"
              className="mt-1.5 text-xs text-[#F6465D] text-left"
            >
              {state.error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={isPending}
          aria-disabled={isPending}
          className="w-full h-11 rounded-lg bg-[#F0B90B] text-[#0B0E11] font-bold text-sm hover:bg-[#d4b05a] transition-colors disabled:opacity-60"
        >
          {isPending ? 'Verificando...' : 'Confirmar'}
        </button>
      </form>

      <p className="text-xs text-[#707A8A] max-w-xs">
        Seus dados são protegidos conforme a LGPD.{' '}
        <Link
          href={ROUTES.PRIVACY}
          className="underline hover:text-[#929AA5]"
        >
          Política de Privacidade
        </Link>
      </p>
    </div>
  )
}
