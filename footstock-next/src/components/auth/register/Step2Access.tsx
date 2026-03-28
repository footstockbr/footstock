'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { step2Schema, type Step2Data } from '@/lib/schemas/auth.schema'
import type { WizardData } from '../register-wizard'

interface Step2Props {
  data: WizardData
  onNext: (data: Partial<WizardData>) => void
}

function PasswordStrength({ password }: { password: string }) {
  const score = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length

  const labels = ['Muito fraca', 'Fraca', 'Regular', 'Forte', 'Muito forte']
  const colors = [
    'bg-[#ef4444]',
    'bg-[#ef4444]',
    'bg-[#c9a84c]',
    'bg-[#22c55e]/80',
    'bg-[#22c55e]',
  ]

  if (!password) return null

  return (
    <div className="flex flex-col gap-1 mt-1" id="password-strength-desc">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all ${
              i <= score ? colors[score] : 'bg-[#2a2010]'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-[#7a7060]" aria-live="polite">
        Força da senha: {labels[score]}
      </p>
    </div>
  )
}

export function Step2Access({ data, onNext }: Step2Props) {
  const [passwordValue, setPasswordValue] = useState(data.password ?? '')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      email: data.email ?? '',
      password: data.password ?? '',
      confirmPassword: '',
    },
    mode: 'onBlur',
  })

  return (
    <form
      data-testid="form-register-step2"
      onSubmit={handleSubmit(onNext)}
      noValidate
      className="flex flex-col gap-4"
      aria-labelledby="wizard-heading"
    >
      <Input
        data-testid="form-register-email-input"
        label="Email"
        type="email"
        placeholder="seu@email.com"
        autoComplete="email"
        inputMode="email"
        autoFocus
        error={errors.email?.message}
        {...register('email')}
      />

      <div>
        <Input
          data-testid="form-register-password-input"
          label="Senha"
          type="password"
          showPasswordToggle
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
          error={errors.password?.message}
          aria-describedby={passwordValue.length > 0 ? 'password-strength-desc' : undefined}
          {...register('password', {
            onChange: (e) => setPasswordValue(e.target.value),
          })}
        />
        <PasswordStrength password={passwordValue} />
      </div>

      <Input
        data-testid="form-register-confirm-password-input"
        label="Confirmar senha"
        type="password"
        showPasswordToggle
        placeholder="Repita a senha"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register('confirmPassword')}
      />

      <Button
        data-testid="form-register-step2-next-button"
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        className="mt-2"
      >
        Próximo →
      </Button>
    </form>
  )
}
