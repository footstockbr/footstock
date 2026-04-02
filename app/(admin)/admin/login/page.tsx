'use client'
// ============================================================================
// Foot Stock — Admin Login Page
// Autenticação admin com rate-limit (5 tentativas), verifica adminRole no banco.
// Rastreabilidade: INT-085, INT-086, TASK-1/ST007
// ============================================================================

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Loader2, Shield } from 'lucide-react'
import { getSupabaseClient } from '@/lib/auth/session'
import { ROUTES } from '@/lib/constants/routes'

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
})

type LoginForm = z.infer<typeof loginSchema>

const MAX_ATTEMPTS = 5

export default function AdminLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reason = searchParams?.get('reason')

  const [attempts, setAttempts] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isBlocked = attempts >= MAX_ATTEMPTS

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (data: LoginForm) => {
    if (isBlocked) return

    setIsLoading(true)
    setErrorMsg(null)

    try {
      const loginRes = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      })

      if (!loginRes.ok) {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)

        if (newAttempts >= MAX_ATTEMPTS) {
          setErrorMsg('Muitas tentativas. Acesso bloqueado temporariamente. (AUTH-006)')
        } else {
          setErrorMsg(`Credenciais inválidas. Tentativas restantes: ${MAX_ATTEMPTS - newAttempts}`)
        }
        return
      }

      const loginJson = (await loginRes.json()) as {
        data?: {
          session?: { accessToken?: string; refreshToken?: string }
          user?: { adminRole?: string | null }
        }
      }

      const accessToken = loginJson.data?.session?.accessToken
      const refreshToken = loginJson.data?.session?.refreshToken

      if (accessToken && refreshToken) {
        const supabase = getSupabaseClient()
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (sessionError) {
          throw new Error(sessionError.message)
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        })
        if (signInError) {
          throw new Error(signInError.message)
        }
      }

      // Verifica adminRole via endpoint seguro (lê do banco, não do JWT)
      const res = await fetch('/api/v1/admin/session/verify', { method: 'GET' })

      if (!res.ok) {
        try {
          const supabase = getSupabaseClient()
          await supabase.auth.signOut()
        } catch {
          // fallback DEV pode não ter sessão Supabase
        }
        setErrorMsg('Acesso negado. Você não possui permissão de administrador. (AUTH-005)')
        return
      }

      router.push(ROUTES.ADMIN)
      router.refresh()
    } catch {
      setErrorMsg('Erro inesperado. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo/Título */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#F0B90B]/10">
            <Shield size={24} className="text-[#F0B90B]" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">Acesso Administrativo</h1>
          <p className="mt-1 text-sm text-zinc-500">Foot Stock — Painel Admin</p>
        </div>

        {/* Aviso de timeout */}
        {reason === 'timeout' && (
          <div className="flex items-start gap-2 rounded-md border border-amber-800/50 bg-amber-900/20 p-3 text-sm text-amber-400">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>Sessão expirada por inatividade. Faça login novamente.</span>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              disabled={isBlocked || isLoading}
              className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#F0B90B] focus:outline-none focus:ring-1 focus:ring-[#F0B90B] disabled:opacity-50"
              placeholder="admin@exemplo.com"
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="mt-1 text-xs text-red-400">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              disabled={isBlocked || isLoading}
              className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-[#F0B90B] focus:outline-none focus:ring-1 focus:ring-[#F0B90B] disabled:opacity-50"
              placeholder="••••••••"
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            {errors.password && (
              <p id="password-error" className="mt-1 text-xs text-red-400">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Erro geral */}
          {errorMsg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-400"
            >
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isBlocked || isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#F0B90B] px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Entrando...
              </>
            ) : isBlocked ? (
              'Acesso bloqueado'
            ) : (
              'Entrar'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
