'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from '@/lib/schemas/auth.schema'
import { apiClient } from '@/lib/api/client'
import { Input } from '@/components/ui/Input'
import { Btn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Card'
import { ROUTES } from '@/lib/constants/routes'

export function ForgotPasswordForm() {
  const [emailSent, setEmailSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(data: ForgotPasswordInput) {
    try {
      await apiClient.post('/api/v1/auth/forgot-password', data)
    } catch {
      // Seguranca: nunca revelar se email existe ou nao
    } finally {
      setSentEmail(data.email)
      setEmailSent(true)
    }
  }

  if (emailSent) {
    return (
      <div className="w-full max-w-sm">
        <Card className="p-6 text-center space-y-4">
          {/* Icone email */}
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 text-accent"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-text-primary">
            Email enviado!
          </h2>

          <p className="text-sm text-text-secondary">
            Se existe uma conta com o e-mail{' '}
            <strong className="text-text-primary">{sentEmail}</strong>, voce
            receberah um link para redefinir sua senha.
          </p>

          <p className="text-xs text-text-secondary">
            Verifique a pasta de spam caso nao encontre o e-mail.
          </p>

          <Link
            href={ROUTES.HOME}
            className="inline-block mt-4 text-sm font-medium text-accent hover:underline min-h-[44px] flex items-center justify-center"
          >
            Voltar ao login
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-text-primary">
          Recuperar senha
        </h1>
        <p className="text-sm text-text-secondary">
          Informe seu e-mail para receber o link de recuperacao
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Input
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <Btn
          type="submit"
          isLoading={isSubmitting}
          className="w-full min-h-[44px]"
        >
          Enviar link de recuperacao
        </Btn>
      </form>

      <p className="text-center text-sm text-text-secondary">
        <Link
          href={ROUTES.HOME}
          className="font-medium text-accent hover:underline"
        >
          Voltar ao login
        </Link>
      </p>
    </div>
  )
}
