'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { RegisterInput } from '@/lib/schemas/auth.schema'
import { Btn } from '@/components/ui/Btn'
import { useToast } from '@/hooks/useToast'
import { ROUTES } from '@/lib/constants/routes'
import { REDIRECT_DELAY_MS } from '@/lib/constants/timing'
import { MESSAGES } from '@/lib/constants/messages'

interface Step4TermsProps {
  formData: Partial<RegisterInput>
  onBack: () => void
}

export function Step4Terms({ formData, onBack }: Step4TermsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [consents, setConsents] = useState({
    terms: false,
    privacy: false,
    marketing: false,
    analytics: false,
    thirdParty: false,
  })

  const canSubmit = consents.terms && consents.privacy

  const handleSubmit = async () => {
    if (!canSubmit) return
    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          consents,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const msg = data?.error?.message ?? 'Erro ao realizar cadastro.'
        setError(msg)
        toast.error('Erro', msg)
        return
      }

      toast.success(MESSAGES.AUTH.REGISTER_WELCOME, MESSAGES.AUTH.REGISTER_WELCOME_DESCRIPTION)
      setTimeout(() => router.push(ROUTES.ONBOARDING), REDIRECT_DELAY_MS)
    } catch {
      setError(MESSAGES.AUTH.REGISTER_CONNECTION_ERROR)
      toast.error('Erro', MESSAGES.AUTH.REGISTER_CONNECTION_ERROR)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggle = (key: keyof typeof consents) =>
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text-primary">Termos e consentimentos</h2>

      <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={consents.terms}
          onChange={() => toggle('terms')}
          className="mt-1 h-4 w-4 accent-accent"
          data-testid="checkbox-terms"
        />
        <span className="text-sm text-text-secondary">
          Li e aceito os{' '}
          <Link href={ROUTES.TERMS} className="text-accent underline" target="_blank">
            Termos de Uso
          </Link>{' '}
          <span className="text-error">*</span>
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={consents.privacy}
          onChange={() => toggle('privacy')}
          className="mt-1 h-4 w-4 accent-accent"
          data-testid="checkbox-privacy"
        />
        <span className="text-sm text-text-secondary">
          Li e aceito a{' '}
          <Link href={ROUTES.PRIVACY} className="text-accent underline" target="_blank">
            Politica de Privacidade
          </Link>{' '}
          <span className="text-error">*</span>
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={consents.marketing}
          onChange={() => toggle('marketing')}
          className="mt-1 h-4 w-4 accent-accent"
          data-testid="checkbox-marketing"
        />
        <span className="text-sm text-text-secondary">
          Aceito receber comunicacoes de marketing
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={consents.analytics}
          onChange={() => toggle('analytics')}
          className="mt-1 h-4 w-4 accent-accent"
          data-testid="checkbox-analytics"
        />
        <span className="text-sm text-text-secondary">
          Aceito o uso de cookies analiticos
        </span>
      </label>

      <label className="flex items-start gap-3 cursor-pointer min-h-[44px]">
        <input
          type="checkbox"
          checked={consents.thirdParty}
          onChange={() => toggle('thirdParty')}
          className="mt-1 h-4 w-4 accent-accent"
          data-testid="checkbox-thirdParty"
        />
        <span className="text-sm text-text-secondary">
          Aceito compartilhamento de dados com terceiros
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Btn type="button" variant="secondary" onClick={onBack} className="flex-1">
          Voltar
        </Btn>
        <Btn
          type="button"
          onClick={handleSubmit}
          fullWidth
          isLoading={isSubmitting}
          disabled={!canSubmit}
          data-testid="btn-submit"
          className="flex-[2]"
        >
          Criar conta
        </Btn>
      </div>
    </div>
  )
}
