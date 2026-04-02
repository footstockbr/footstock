'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  resetPasswordSchema,
  type ResetPasswordInput,
} from '@/lib/schemas/auth.schema'
import { apiClient } from '@/lib/api/client'
import { useToast } from '@/hooks/useToast'
import { Input } from '@/components/ui/Input'
import { Btn } from '@/components/ui/Btn'
import { Card } from '@/components/ui/Card'
import { ROUTES } from '@/lib/constants/routes'
import { MESSAGES } from '@/lib/constants/messages'

interface ResetPasswordFormProps {
  token: string | null
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: token ?? '',
      password: '',
      confirmPassword: '',
    },
  })

  // Token invalido ou ausente
  if (!token) {
    return (
      <div className="w-full max-w-sm">
        <Card className="p-6 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7 text-red-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-text-primary">
            Link invalido ou expirado
          </h2>

          <p className="text-sm text-text-secondary">
            O link de recuperacao de senha e invalido ou ja expirou. Solicite um
            novo link.
          </p>

          <Link
            href={ROUTES.FORGOT_PASSWORD}
            className="inline-block mt-4 text-sm font-medium text-accent hover:underline min-h-[44px] flex items-center justify-center"
          >
            Solicitar novo link
          </Link>
        </Card>
      </div>
    )
  }

  async function onSubmit(data: ResetPasswordInput) {
    try {
      await apiClient.post('/api/v1/auth/reset-password', {
        token: data.token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      })

      toast.success(MESSAGES.AUTH.PASSWORD_RESET_SUCCESS)

      setTimeout(() => {
        router.replace(ROUTES.HOME)
      }, 1500)
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
        'Nao foi possivel redefinir a senha. Tente novamente.'
      toast.error(message)
    }
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-text-primary">
          Redefinir senha
        </h1>
        <p className="text-sm text-text-secondary">
          Escolha uma nova senha para sua conta
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <input type="hidden" {...register('token')} />

        <div className="relative">
          <Input
            label="Nova senha"
            type={showPassword ? 'text' : 'password'}
            placeholder="Sua nova senha"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3 top-9 text-text-secondary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
          <p className="mt-1 text-xs text-text-secondary">
            Minimo 8 caracteres, 1 maiuscula e 1 numero
          </p>
        </div>

        <div className="relative">
          <Input
            label="Confirmar nova senha"
            type={showConfirm ? 'text' : 'password'}
            placeholder="Repita a nova senha"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            aria-label={
              showConfirm ? 'Ocultar confirmacao' : 'Mostrar confirmacao'
            }
            className="absolute right-3 top-9 text-text-secondary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            {showConfirm ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        <Btn
          type="submit"
          isLoading={isSubmitting}
          className="w-full min-h-[44px]"
        >
          Redefinir senha
        </Btn>
      </form>
    </div>
  )
}
