'use client'
// ============================================================================
// Foot Stock — Club Portal Login
// Login separado para representantes de clubes parceiros.
// Sem cadastro, sem "esqueci a senha" — contas gerenciadas pelo SuperAdmin.
// Rastreabilidade: INT-084, US-025, AUTH_001, ADMIN_050, ADMIN_051, TASK-1/ST002
// ============================================================================

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { getSupabaseClient } from '@/lib/auth/session'
import { ToastContainer } from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'
import { Input } from '@/components/ui/Input'
import { Btn } from '@/components/ui/Btn'
import { ROUTES, MESSAGES } from '@/lib/constants'

// ---------------------------------------------------------------------------
// Schema Zod
// ---------------------------------------------------------------------------

const clubLoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

type ClubLoginForm = z.infer<typeof clubLoginSchema>

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ClubLoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[calc(100vh-120px)] items-center justify-center"><span className="text-zinc-500">Carregando...</span></div>}>
      <ClubLoginContent />
    </Suspense>
  )
}

function ClubLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorParam = searchParams?.get('error')

  const [showPassword, setShowPassword] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const { toasts, toast, removeToast } = useToast()

  // Mostrar toast de erro baseado em query param
  useEffect(() => {
    if (errorParam === 'session_expired') {
      toast.error(MESSAGES.AUTH.CLUB_SESSION_EXPIRED, MESSAGES.AUTH.CLUB_SESSION_EXPIRED_DESCRIPTION)
    } else if (errorParam === 'unauthorized') {
      toast.error(MESSAGES.AUTH.CLUB_ACCESS_DENIED, MESSAGES.AUTH.CLUB_ACCESS_DENIED_DESCRIPTION)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorParam])

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ClubLoginForm>({ resolver: zodResolver(clubLoginSchema) })

  const onSubmit = async (data: ClubLoginForm) => {
    setIsPending(true)

    try {
      const supabase = getSupabaseClient()

      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error || !authData.user) {
        toast.error(MESSAGES.AUTH.CLUB_INVALID_CREDENTIALS, MESSAGES.AUTH.CLUB_INVALID_CREDENTIALS_DESCRIPTION)
        return
      }

      // Verificar role CLUB_PARTNER no user_metadata
      const userRole = authData.user.user_metadata?.adminRole as string | undefined
      if (userRole !== 'CLUB_PARTNER') {
        await supabase.auth.signOut()
        reset()
        toast.error(MESSAGES.AUTH.CLUB_ACCESS_DENIED, MESSAGES.AUTH.CLUB_ACCESS_DENIED_DESCRIPTION)
        return
      }

      router.push(ROUTES.CLUB)
      router.refresh()
    } catch {
      toast.error(MESSAGES.AUTH.CLUB_GENERIC_ERROR, MESSAGES.AUTH.CLUB_GENERIC_ERROR_DESCRIPTION)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-12">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Card de login */}
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-white/10 bg-zinc-900/60 p-8 shadow-xl">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <svg
            width="48"
            height="48"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="16" cy="16" r="16" fill="#C9A84C" fillOpacity="0.15" />
            <path
              d="M16 6L20 14H28L22 19L24 27L16 22L8 27L10 19L4 14H12L16 6Z"
              fill="#C9A84C"
            />
          </svg>
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Portal do Clube</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Acesse o painel exclusivo do seu clube
            </p>
          </div>
        </div>

        {/* Formulário */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          aria-label="Login do Portal do Clube"
          className="space-y-4"
          noValidate
        >
          {/* Email */}
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-300">
              Email
            </label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder="seu@clube.com"
              disabled={isPending}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <p id="email-error" className="mt-1 text-xs text-red-400">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Senha */}
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-300">
              Senha
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={isPending}
                aria-describedby={errors.password ? 'password-error' : undefined}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" className="mt-1 text-xs text-red-400">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Botão submit */}
          <Btn
            type="submit"
            variant="primary"
            disabled={isPending}
            className="min-h-[48px] w-full"
          >
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Entrando...
              </span>
            ) : (
              'Entrar no Portal'
            )}
          </Btn>
        </form>

        {/* Nota informativa (sem links de cadastro ou recuperação) */}
        <p className="text-center text-xs text-zinc-600">
          Acesso gerenciado exclusivamente pelo administrador da plataforma.
        </p>
      </div>
    </div>
  )
}
