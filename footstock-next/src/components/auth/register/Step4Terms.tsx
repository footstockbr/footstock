'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import type { WizardData } from '../register-wizard'
import { AccountExistsCard } from './AccountExistsCard'

type AccountExistsState =
  | { reason: 'email'; emailHint: string }
  | { reason: 'cpf' }

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
  const [accountExists, setAccountExists] = useState<AccountExistsState | null>(null)
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
    // Limpa card de conta-existente em retries (ex: usuario trocou email/cpf
    // no wizard e voltou pra cá). Sem isso a UI mostra estado desatualizado.
    setAccountExists(null)
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
        referredByCode: data.referredByCode || undefined,
      }

      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        const code = json.error?.code as string | undefined
        const meta = json.error?.meta as
          | { reason?: 'email' | 'cpf'; emailHint?: string }
          | undefined

        // AUTH-004 (email) e AUTH-003 (CPF) viraram cards inline com CTA de
        // login — toast generico nao orientava o usuario a recuperar a conta.
        if (code === 'AUTH-004' && meta?.reason === 'email') {
          // Fallback pra data.email garante string (meta.emailHint é optional no contrato wire).
          const hint = meta.emailHint ?? data.email ?? ''
          setAccountExists({ reason: 'email', emailHint: hint })
          return
        }
        if (code === 'AUTH-003' && meta?.reason === 'cpf') {
          setAccountExists({ reason: 'cpf' })
          return
        }

        toast.error(json.error?.message ?? 'Erro ao criar conta. Tente novamente.')
        return
      }

      // Auth.js v5 — abrir sessao via /api/v1/auth/login (mesmo path do login-form).
      // Em dev usa /api/v1/auth/dev-login (espelha LoginForm.performLogin).
      const isDev = process.env.NODE_ENV !== 'production'
      const loginEndpoint = isDev ? '/api/v1/auth/dev-login' : '/api/v1/auth/login'
      const loginRes = await fetch(loginEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email, password: data.password }),
      })
      const loginJson = await loginRes.json()
      if (!loginRes.ok || loginJson.error) {
        // Conta criada mas signIn falhou — usuario consegue fazer login manualmente.
        toast.error('Conta criada, mas houve um problema ao iniciar a sessão. Por favor, faça login.')
        setTimeout(() => router.replace(ROUTES.LOGIN), 1500)
        return
      }

      // ID-008 (Codex): cookie fs-admin-role NAO e setado aqui porque novos
      // usuarios sempre saem do register com planType=JOGADOR e adminRole=null
      // (vide src/app/api/v1/auth/register/route.ts §6b). O middleware lera
      // ausencia do cookie como "user comum" — comportamento correto. Login
      // posterior (rota /api/v1/auth/login) e o ponto canonico para setar o
      // cookie quando aplicavel.
      const finalData = { ...data, consents }
      onComplete(finalData)
      toast.success('Conta criada com sucesso! Bem-vindo ao FootStock.')
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
          O FootStock é uma plataforma educacional de simulação financeira. É necessário ter 18 anos
          ou mais para se cadastrar.
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

      {accountExists ? (
        <AccountExistsCard
          reason={accountExists.reason}
          emailHint={accountExists.reason === 'email' ? accountExists.emailHint : undefined}
          onDismiss={() => setAccountExists(null)}
        />
      ) : (
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
      )}
    </form>
  )
}
