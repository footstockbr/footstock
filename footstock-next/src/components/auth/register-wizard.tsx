'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { Step1PersonalData } from './register/Step1PersonalData'
import { Step2Access } from './register/Step2Access'
import { Step3ClubSelect } from './register/Step3ClubSelect'
import { Step4Terms } from './register/Step4Terms'
import { ROUTES } from '@/lib/constants/routes'
import { cn } from '@/lib/utils'

type WizardStep = 1 | 2 | 3 | 4

const STEP_LABELS = ['Dados', 'Acesso', 'Clube', 'Termos']
const STEP_TITLES = ['Seus dados', 'Criar acesso', 'Clube favorito', 'Termos de uso']

export interface WizardData {
  // Step 1
  name?: string
  phone?: string
  birthDate?: string
  cpf?: string
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

/**
 * Orquestrador do wizard de registro de 4 etapas.
 * Estado mantido localmente — sem persistência em URL.
 */
export function RegisterWizard() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [wizardData, setWizardData] = useState<WizardData>({})

  const updateData = useCallback((data: Partial<WizardData>) => {
    setWizardData((prev) => ({ ...prev, ...data }))
  }, [])

  const goNext = useCallback(() => {
    if (currentStep < 4) setCurrentStep((prev) => (prev + 1) as WizardStep)
  }, [currentStep])

  const goPrev = useCallback(() => {
    if (currentStep > 1) setCurrentStep((prev) => (prev - 1) as WizardStep)
    else router.push(ROUTES.HOME)
  }, [currentStep, router])

  const handleStepNext = useCallback(
    (data: Partial<WizardData>) => {
      updateData(data)
      goNext()
    },
    [updateData, goNext]
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
        className="flex items-center gap-1 text-sm text-[#7a7060] hover:text-[#f0ead6] transition-colors mb-4"
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
          aria-valuemax={4}
          aria-label={`Etapa ${currentStep} de 4`}
        >
          {STEP_LABELS.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-all',
                i + 1 < currentStep
                  ? 'bg-[#c9a84c]'
                  : i + 1 === currentStep
                  ? 'bg-[rgba(201,168,76,.6)]'
                  : 'bg-[#2a2010]'
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
                i + 1 <= currentStep ? 'text-[#c9a84c]' : 'text-[#4a3d2a]'
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
        className="text-xl font-bold text-[#f0ead6] mb-0.5"
      >
        {STEP_TITLES[currentStep - 1]}
      </h1>
      <p className="text-xs text-[#4a3d2a] mb-6" aria-live="polite">
        Etapa {currentStep} de 4
      </p>

      {/* Steps */}
      {currentStep === 1 && (
        <Step1PersonalData data={wizardData} onNext={handleStepNext} />
      )}
      {currentStep === 2 && (
        <Step2Access data={wizardData} onNext={handleStepNext} />
      )}
      {currentStep === 3 && (
        <Step3ClubSelect data={wizardData} onNext={handleStepNext} />
      )}
      {currentStep === 4 && (
        <Step4Terms data={wizardData} onComplete={handleComplete} />
      )}

      {currentStep === 1 && (
        <p className="text-center text-sm text-[#7a7060] mt-6">
          Já tem conta?{' '}
          <a
            href={ROUTES.LOGIN}
            className="text-[#c9a84c] hover:text-[#d4b466] font-medium transition-colors"
          >
            Entrar
          </a>
        </p>
      )}
    </div>
  )
}
