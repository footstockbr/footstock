'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCPF, formatPhone } from '@/lib/utils/validators'
import { step1Schema, type Step1Data } from '@/lib/schemas/auth.schema'
import type { WizardData } from '../register-wizard'
import { maskDateInput, displayToIso } from '@/lib/utils/format'

interface Step1Props {
  data: WizardData
  onNext: (data: Partial<WizardData>) => void
}

export function Step1PersonalData({ data, onNext }: Step1Props) {
  const [birthDisplay, setBirthDisplay] = useState('')
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      name: data.name ?? '',
      phone: data.phone ?? '',
      birthDate: data.birthDate ?? '',
      cpf: data.cpf ?? '',
    },
    mode: 'onBlur',
  })

  function handleBirthDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskDateInput(e.target.value)
    setBirthDisplay(masked)
    const iso = displayToIso(masked)
    setValue('birthDate', iso, { shouldValidate: iso.length === 10 })
  }

  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCPF(e.target.value)
    setValue('cpf', formatted, { shouldValidate: false })
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value)
    setValue('phone', formatted, { shouldValidate: false })
  }

  return (
    <form
      data-testid="form-register-step1"
      onSubmit={handleSubmit(onNext)}
      noValidate
      className="flex flex-col gap-4"
      aria-labelledby="wizard-heading"
    >
      <Input
        data-testid="form-register-name-input"
        label="Nome completo"
        type="text"
        placeholder="João da Silva"
        autoComplete="name"
        autoFocus
        error={errors.name?.message}
        inputMode="text"
        {...register('name')}
      />

      <Input
        data-testid="form-register-phone-input"
        label="Telefone"
        type="tel"
        placeholder="(11) 99999-9999"
        autoComplete="tel"
        error={errors.phone?.message}
        inputMode="tel"
        {...register('phone', { onChange: handlePhoneChange })}
      />

      <Input
        data-testid="form-register-birthdate-input"
        label="Data de nascimento"
        type="text"
        placeholder="dd/mm/aaaa"
        inputMode="numeric"
        maxLength={10}
        autoComplete="bday"
        hint="Você deve ter ao menos 18 anos"
        error={errors.birthDate?.message}
        value={birthDisplay}
        onChange={handleBirthDateChange}
      />

      <Input
        data-testid="form-register-cpf-input"
        label="CPF"
        type="text"
        placeholder="000.000.000-00"
        autoComplete="off"
        inputMode="numeric"
        maxLength={14}
        hint="Seu CPF não é armazenado, apenas um código de verificação"
        error={errors.cpf?.message}
        {...register('cpf', { onChange: handleCPFChange })}
      />

      <Button
        data-testid="form-register-step1-next-button"
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        isLoading={isSubmitting}
        className="mt-2"
      >
        Próximo →
      </Button>
    </form>
  )
}
