'use client'

import { useState, useCallback } from 'react'
import type { RegisterInput } from '@/lib/schemas/auth.schema'
import { Step1PersonalData } from './Step1PersonalData'
import { Step2Access } from './Step2Access'
import { Step3ClubSelect } from './Step3ClubSelect'
import { Step4Terms } from './Step4Terms'

const STEP_LABELS = [
  'Dados pessoais',
  'Acesso',
  'Clube favorito',
  'Termos',
]

export function RegisterWizard() {
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<Partial<RegisterInput>>({})

  const handleNext = useCallback(
    (stepData: Partial<RegisterInput>) => {
      setFormData((prev) => ({ ...prev, ...stepData }))
      setCurrentStep((prev) => Math.min(prev + 1, 4))
    },
    [],
  )

  const handleBack = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }, [])

  return (
    <div className="w-full max-w-md mx-auto px-4">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {STEP_LABELS.map((label, i) => (
            <span
              key={label}
              className={`text-xs font-medium ${
                i + 1 <= currentStep ? 'text-accent' : 'text-text-muted'
              }`}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>
        <div className="h-1 bg-bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      {currentStep === 1 && <Step1PersonalData onNext={handleNext} />}
      {currentStep === 2 && (
        <Step2Access onNext={handleNext} onBack={handleBack} />
      )}
      {currentStep === 3 && (
        <Step3ClubSelect
          onNext={(club) => handleNext({ favoriteClub: club ?? undefined })}
          onBack={handleBack}
          defaultValue={formData.favoriteClub ?? null}
        />
      )}
      {currentStep === 4 && (
        <Step4Terms formData={formData} onBack={handleBack} />
      )}
    </div>
  )
}
