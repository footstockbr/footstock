'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, type LoginInput } from '@/lib/schemas/auth.schema'
import { apiClient } from '@/lib/api/client'
import { getSupabaseClient } from '@/lib/auth/session'
import { useToast } from '@/hooks/useToast'
import { Input } from '@/components/ui/Input'
import { Btn } from '@/components/ui/Btn'
import { ROUTES } from '@/lib/constants/routes'
import { MESSAGES } from '@/lib/constants/messages'
import { WebAuthnButton } from '@/components/auth/WebAuthnButton'
import { DEV_TEST_USERS } from '@/lib/constants/dev-test-users'

export function LoginForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [devLoginRole, setDevLoginRole] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const emailValue = watch('email')

  async function performLogin(data: LoginInput) {
    try {
      const response = await apiClient.post('/api/v1/auth/login', data)
      const { session, user } = response.data.data

      // Persistir sessao no browser antes do redirect, para middleware reconhecer o usuario
      if (session?.accessToken && session?.refreshToken) {
        const supabase = getSupabaseClient()
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: session.accessToken,
          refresh_token: session.refreshToken,
        })
        if (sessionError) {
          throw new Error(sessionError.message)
        }

        // Garante persistência completa (cookies SSR + storage client) antes do redirect
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        })
        if (signInError) {
          throw new Error(signInError.message)
        }
      } else {
        // Login em modo DEV fallback (sem sessao Supabase): limpar token anterior
        // para evitar reaproveitar sessão de outro usuário.
        const supabase = getSupabaseClient()
        if (supabase) {
          await supabase.auth.signOut()
        }
      }

      toast.success(MESSAGES.AUTH.LOGIN_SUCCESS)
      const targetRoute =
        user?.adminRole === 'CLUB_PARTNER' ? '/club' :
        user?.adminRole ? ROUTES.ADMIN : ROUTES.DASHBOARD
      router.replace(targetRoute)
      router.refresh()
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || MESSAGES.AUTH.LOGIN_FAILED
      toast.error(message)
    }
  }

  async function onSubmit(data: LoginInput) {
    await performLogin(data)
  }

  const devUsersByRole = Object.entries(DEV_TEST_USERS).map(([email, profile]) => ({
    role: profile.label ?? profile.adminRole ?? profile.planType,
    email,
    password: profile.password,
  }))

  async function handleDevCardLogin(email: string, password: string, role: string) {
    setDevLoginRole(role)
    await performLogin({ email, password })
    setDevLoginRole(null)
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-black/5 shadow-sm">
          <Image
            src="/logo-foot.png"
            alt="Logo Foot Stock"
            width={56}
            height={56}
            className="h-full w-full object-contain"
            priority
          />
        </div>
        <h1 className="text-2xl font-bold text-text-primary">
          Entrar na sua conta
        </h1>
        <p className="text-sm text-text-secondary">
          O mercado do futebol te espera
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

        <Input
          label="Senha"
          type={showPassword ? 'text' : 'password'}
          placeholder="Sua senha"
          autoComplete="current-password"
          error={errors.password?.message}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="text-text-secondary hover:text-text-primary transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {showPassword ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          }
          {...register('password')}
        />

        <div className="flex justify-end">
          <Link
            href={ROUTES.FORGOT_PASSWORD}
            className="text-sm text-accent hover:underline"
          >
            Esqueci minha senha
          </Link>
        </div>

        <Btn
          type="submit"
          variant="plan"
          size="lg"
          isLoading={isSubmitting}
          className="w-full min-h-[44px]"
        >
          Entrar
        </Btn>
      </form>

      {/* WebAuthn */}
      {emailValue && (
        <WebAuthnButton
          email={emailValue}
          onError={(msg) => toast.error(msg)}
          onSuccess={() => router.replace(ROUTES.DASHBOARD)}
        />
      )}

      {/* Registro */}
      <p className="text-center text-sm text-text-secondary pt-2 border-t border-border-default/60">
        Ainda nao tem conta?{' '}
        <Link
          href={ROUTES.REGISTER}
          className="font-semibold text-accent hover:underline"
        >
          Criar conta
        </Link>
      </p>

      <footer className="pt-3 border-t border-border-default/60">
          <div className="mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Usuários de teste
            </h2>
          </div>

          <div className="flex flex-row gap-2 overflow-x-auto pb-1">
            {devUsersByRole.map((user) => (
              <button
                key={user.role}
                type="button"
                onClick={() => void handleDevCardLogin(user.email, user.password, user.role)}
                aria-label={`Entrar como ${user.role}`}
                disabled={isSubmitting || devLoginRole === user.role}
                className="min-w-[190px] rounded-md border border-border-default bg-bg-card/50 p-2 text-left transition-colors hover:border-accent/60 hover:bg-bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <p className="text-[11px] font-bold text-accent">{user.role}</p>
                <p className="mt-1 text-[11px] text-text-secondary break-all">
                  Login: <span className="font-mono text-text-primary">{user.email}</span>
                </p>
                <p className="mt-1 text-[11px] text-text-secondary break-all">
                  Senha: <span className="font-mono text-text-primary">{user.password}</span>
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-text-muted">
                  {devLoginRole === user.role ? 'Entrando...' : 'Clique para entrar'}
                </p>
              </button>
            ))}
          </div>
        </footer>
    </div>
  )
}
