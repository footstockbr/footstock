'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { step2Schema, type Step2Input } from '@/lib/schemas/auth.schema'
import { Input } from '@/components/ui/Input'
import { Btn } from '@/components/ui/Btn'

interface Step2AccessProps {
  onNext: (data: Step2Input) => void
  onBack: () => void
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  ]
  const score = checks.filter(Boolean).length

  const colors = ['bg-error', 'bg-warning', 'bg-yellow-400', 'bg-success']
  const labels = ['Fraca', 'Razoavel', 'Boa', 'Forte']

  if (!password) return null

  return (
    <div className="mt-1" aria-live="polite">
      <div className="flex gap-1 mb-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${
              i < score ? colors[score - 1] : 'bg-bg-surface'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-text-muted">
        Forca: {score > 0 ? labels[score - 1] : ''}
      </span>
    </div>
  )
}

export function Step2Access({ onNext, onBack }: Step2AccessProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Step2Input>({
    resolver: zodResolver(step2Schema),
  })

  const passwordValue = watch('password', '')

  const eyeIcon = (visible: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className="text-text-muted hover:text-text-primary"
      aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
    >
      {visible ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  )

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4" noValidate>
      <h2 className="text-lg font-semibold text-text-primary">Dados de acesso</h2>

      <Input
        {...register('email')}
        label="E-mail"
        type="email"
        placeholder="seu@email.com"
        error={errors.email?.message}
        autoFocus
        required
        data-testid="input-email"
      />

      <div>
        <Input
          {...register('password')}
          label="Senha"
          type={showPassword ? 'text' : 'password'}
          placeholder="Minimo 8 caracteres"
          error={errors.password?.message}
          rightElement={eyeIcon(showPassword, () => setShowPassword(!showPassword))}
          required
          data-testid="input-password"
        />
        <PasswordStrength password={passwordValue} />
      </div>

      <Input
        {...register('confirmPassword')}
        label="Confirmar senha"
        type={showConfirm ? 'text' : 'password'}
        placeholder="Repita a senha"
        error={errors.confirmPassword?.message}
        rightElement={eyeIcon(showConfirm, () => setShowConfirm(!showConfirm))}
        required
        data-testid="input-confirmPassword"
      />

      <div className="flex gap-3">
        <Btn type="button" variant="secondary" onClick={onBack} className="flex-1">
          Voltar
        </Btn>
        <Btn type="submit" fullWidth isLoading={isSubmitting} data-testid="btn-next" className="flex-[2]">
          Continuar
        </Btn>
      </div>
    </form>
  )
}
