'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { step1Schema, type Step1Input } from '@/lib/schemas/auth.schema'
import { Input } from '@/components/ui/Input'
import { Btn } from '@/components/ui/Btn'
import { formatCPF, formatPhone } from '@/lib/utils/validators'

interface Step1PersonalDataProps {
  onNext: (data: Step1Input) => void
}

export function Step1PersonalData({ onNext }: Step1PersonalDataProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Step1Input>({
    resolver: zodResolver(step1Schema),
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4" noValidate>
      <h2 className="text-lg font-semibold text-text-primary">Dados pessoais</h2>

      <Input
        {...register('name')}
        label="Nome completo"
        placeholder="Seu nome completo"
        error={errors.name?.message}
        autoFocus
        required
        data-testid="input-name"
      />

      <Input
        {...register('phone', {
          onChange: (e) => {
            const formatted = formatPhone(e.target.value)
            setValue('phone', formatted, { shouldValidate: false })
          },
        })}
        label="Telefone"
        placeholder="(11) 99999-9999"
        error={errors.phone?.message}
        inputMode="tel"
        required
        data-testid="input-phone"
      />

      <Input
        {...register('birthDate')}
        label="Data de nascimento"
        type="date"
        error={errors.birthDate?.message}
        hint="Minimo 18 anos"
        required
        data-testid="input-birthDate"
      />

      <Input
        {...register('cpf', {
          onChange: (e) => {
            const formatted = formatCPF(e.target.value)
            setValue('cpf', formatted, { shouldValidate: false })
          },
        })}
        label="CPF"
        placeholder="000.000.000-00"
        error={errors.cpf?.message}
        inputMode="numeric"
        required
        data-testid="input-cpf"
      />

      <Btn type="submit" fullWidth isLoading={isSubmitting} data-testid="btn-next">
        Continuar
      </Btn>
    </form>
  )
}
