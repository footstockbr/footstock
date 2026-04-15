'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useAnalytics } from '@/hooks/useAnalytics'
import { Step1PersonalData } from './register/Step1PersonalData'
import { Step2AgeConfirmation } from './register/Step2AgeConfirmation'
import { Step2Access as Step3Access } from './register/Step2Access'
import { Step3ClubSelect as Step4ClubSelect } from './register/Step3ClubSelect'
import { Step4Terms as Step5Terms } from './register/Step4Terms'
import { ROUTES } from '@/lib/constants/routes'
import { cn } from '@/lib/utils'

type WizardStep = 1 | 2 | 3 | 4 | 5

const STEP_LABELS = ['Dados', 'Idade', 'Acesso', 'Clube', 'Termos']
const STEP_TITLES = ['Seus dados', 'Confirmação de idade', 'Criar acesso', 'Clube favorito', 'Termos de uso']

export interface WizardData {
  // Step 1
  name?: string
  phone?: string
  birthDate?: string
  cpf?: string
  referredByCode?: string
  // Step 2
  email?: string
  password?: string
  confirmPassword?: string
  // Step 3
  favoriteClub?: string
  // Step 4
  consents?: {
    terms: boolean
    marketing: boolean
    analytics: boolean
    thirdParty: boolean
  }
}

interface RegisterWizardProps {
  initialReferredByCode?: string
}

/**
 * Orquestrador do wizard de registro de 5 etapas.
 * Estado mantido localmente — sem persistência em URL.
 * initialReferredByCode: código pré-preenchido vindo de /ref/[code] via page.tsx (server component)
 */
const STEP_NAMES = ['personal_data', 'age_confirmation', 'access', 'favorite_club', 'terms']

export function RegisterWizard({ initialReferredByCode = '' }: RegisterWizardProps) {
  const router = useRouter()
  const { track } = useAnalytics()
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [wizardData, setWizardData] = useState<WizardData>({ referredByCode: initialReferredByCode })

  // EVT-001: Cadastro Iniciado — ao montar o wizard
  useEffect(() => {
    track('signup_started', {
      referrer: typeof document !== 'undefined' ? document.referrer || 'direct' : 'direct',
      device_type: typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop',
    })
  }, [track])

  // EVT-039: affiliate_link_clicked — quando ref code e detectado via query param ou cookie
  useEffect(() => {
    if (initialReferredByCode) {
      track('affiliate_link_clicked', {
        affiliateCode: initialReferredByCode,
        affiliateType: 'unknown', // tipo so e resolvido no servidor
        source: typeof document !== 'undefined' ? document.referrer || 'direct' : 'direct',
      })
    }
  }, [initialReferredByCode, track])

  const updateData = useCallback((data: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...data }))
  }, [])

  const goNext = useCallback(() => {
    if (currentStep < 5) setCurrentStep((prev) => (prev + 1) as WizardStep)
  }, [currentStep])

  const goPrev = useCallback(() => {
    if (currentStep > 1) setCurrentStep((prev) => (prev - 1) as WizardStep)
    else router.push(ROUTES.HOME)
  }, [currentStep, router])

  const handleStepNext = useCallback(
    (data: Partial<WizardData>) => {
      // EVT-002: Etapa do Cadastro Concluida
      track('signup_step_completed', {
        step: currentStep as 1 | 2 | 3 | 4,
        step_name: STEP_NAMES[currentStep - 1],
      })
      updateData(data)
      goNext()
    },
    [updateData, goNext, track, currentStep]
  )

  const handleComplete = useCallback(
    (finalData: WizardData) => {
      setWizardData(finalData)
    },
    []
  )

  return (
    <div data-testid="register-wizard" className="w-full max-w-sm">
      {/* Back button */}
      <button
        data-testid="register-wizard-back-button"
        type="button"
        onClick={goPrev}
        className="flex items-center gap-1 text-sm text-[#929AA5] hover:text-[#EAECEF] transition-colors mb-4"
        aria-label={currentStep === 1 ? 'Voltar ao login' : 'Etapa anterior'}
      >
        <ChevronLeft className="h-4 w-4" />
        {currentStep === 1 ? 'Login' : 'Voltar'}
      </button>

      {/* Stepper */}
      <div className="flex flex-col gap-1 mb-6">
        <div
          className="flex gap-1"
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={1}
          aria-valuemax={5}
          aria-label={`Etapa ${currentStep} de 5`}
        >
          {STEP_LABELS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-all',
                i + 1 < currentStep
                  ? 'bg-[#F0B90B]'
                  : i + 1 === currentStep
                  ? 'bg-[rgba(240,185,11,.6)]'
                  : 'bg-[#2B3139]'
              )}
            />
          ))}
        </div>
        <div className="flex">
          {STEP_LABELS.map((label, i) => (
            <span
              key={i}
              className={cn(
                'flex-1 text-[10px] text-center',
                i + 1 <= currentStep ? 'text-[#F0B90B]' : 'text-[#707A8A]'
              )}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Heading */}
      <h1
        id="wizard-heading"
        className="text-xl font-bold text-[#EAECEF] mb-0.5"
      >
        {STEP_TITLES[currentStep - 1]}
      </h1>
      <p className="text-xs text-[#707A8A] mb-6" aria-live="polite">
        Etapa {currentStep} de 5
      </p>

      {/* Steps */}
      {currentStep === 1 && (
        <Step1PersonalData data={wizardData} onNext={handleStepNext} />
      )}
      {currentStep === 2 && (
        <Step2AgeConfirmation data={wizardData} onNext={handleStepNext} />
      )}
      {currentStep === 3 && (
        <Step3Access data={wizardData} onNext={handleStepNext} />
      )}
      {currentStep === 4 && (
        <Step4ClubSelect data={wizardData} onNext={handleStepNext} />
      )}
      {currentStep === 5 && (
        <Step5Terms data={wizardData} onComplete={handleComplete} />
      )}

      {currentStep === 1 && (
        <p className="text-center text-sm text-[#929AA5] mt-6">
          Já tem conta?{' '}
          <a
            href={ROUTES.LOGIN}
            className="text-[#F0B90B] hover:text-[#FCD535] font-medium transition-colors"
          >
            Entrar
          </a>
        </p>
      )}
    </div>
  )
}
