'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import type { WizardData } from '../register-wizard'

interface Step4Props {
  data: WizardData
  onComplete: (data: WizardData) => void
}

interface ConsentItemProps {
  id: string
  label: React.ReactNode
  description?: string
  required?: boolean
  checked: boolean
  onChange: () => void
  testId?: string
}

function ConsentItem({ id, label, description, required, checked, onChange, testId }: ConsentItemProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 cursor-pointer min-h-[44px] py-1"
    >
      <input
        id={id}
        data-testid={testId}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        required={required}
        className="mt-0.5 accent-[#F0B90B] w-4 h-4 flex-shrink-0"
        aria-required={required}
      />
      <div>
        <span className="text-sm text-[#EAECEF]">
          {label}
          {required && (
            <span className="text-[#F6465D] ml-1" aria-hidden="true">
              *
            </span>
          )}
        </span>
        {description && <p className="text-xs text-[#929AA5] mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

export function Step4Terms({ data, onComplete }: Step4Props) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [consents, setConsents] = useState({
    terms: false,
    marketing: false,
    analytics: false,
    thirdParty: false,
  })

  const toggleConsent = (key: keyof typeof consents) => {
    setConsents((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = async () => {
    if (!consents.terms) {
      toast.error('Você deve aceitar os Termos de Uso para continuar')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        name: data.name,
        email: data.email,
        password: data.password,
        confirmPassword: data.confirmPassword,
        phone: data.phone,
        birthDate: data.birthDate,
        cpf: data.cpf,
        favoriteClub: data.favoriteClub,
        consents,
      }

      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        toast.error(json.error?.message ?? 'Erro ao criar conta. Tente novamente.')
        return
      }

      const finalData = { ...data, consents }
      onComplete(finalData)
      toast.success('Conta criada com sucesso! Bem-vindo ao Foot Stock.')
      setTimeout(() => router.replace(ROUTES.ONBOARDING), 1000)
    } catch {
      toast.error('Erro ao criar conta. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form data-testid="form-register-step4" className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}>
      {/* Termos obrigatórios */}
      <fieldset className="flex flex-col gap-3 bg-[#1E2329] border border-[rgba(240,185,11,.18)] rounded-lg p-4">
        <legend className="sr-only">Consentimentos obrigatórios</legend>
        <ConsentItem
          id="consent-terms"
          testId="form-register-terms-checkbox"
          label={
            <>
              Aceito os{' '}
              <Link href={ROUTES.TERMS} target="_blank" rel="noopener" className="text-[#F0B90B] underline">
                Termos de Uso
              </Link>{' '}
              e a{' '}
              <Link href={ROUTES.PRIVACY} target="_blank" rel="noopener" className="text-[#F0B90B] underline">
                Política de Privacidade
              </Link>
            </>
          }
          required
          checked={consents.terms}
          onChange={() => toggleConsent('terms')}
        />
        <p className="text-xs text-[#707A8A] ml-7">
          O Foot Stock é uma plataforma educacional de simulação financeira. Usuários devem ter 18
          anos conforme o ECA Digital (Lei 14.790/2023).
        </p>
      </fieldset>

      {/* Consentimentos opcionais */}
      <fieldset className="flex flex-col gap-3 bg-[#1E2329] border border-[rgba(240,185,11,.18)] rounded-lg p-4">
        <legend className="text-xs font-medium text-[#929AA5] uppercase tracking-wide">
          Opcionais
        </legend>
        <ConsentItem
          id="consent-marketing"
          label="Receber comunicações de marketing"
          description="Novidades, promoções e conteúdo sobre futebol"
          checked={consents.marketing}
          onChange={() => toggleConsent('marketing')}
        />
        <ConsentItem
          id="consent-analytics"
          label="Permitir analytics de uso"
          description="Nos ajuda a melhorar a experiência do app"
          checked={consents.analytics}
          onChange={() => toggleConsent('analytics')}
        />
        <ConsentItem
          id="consent-third-party"
          label="Compartilhar dados com parceiros"
          description="Patrocinadores e parceiros selecionados"
          checked={consents.thirdParty}
          onChange={() => toggleConsent('thirdParty')}
        />
      </fieldset>

      <Button
        data-testid="form-register-submit-button"
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        isLoading={isSubmitting}
        disabled={!consents.terms}
        aria-disabled={!consents.terms}
        className="mt-2"
      >
        Criar minha conta
      </Button>
    </form>
  )
}
