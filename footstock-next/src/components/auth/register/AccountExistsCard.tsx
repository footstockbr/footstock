'use client'

import { useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Fingerprint, X, UserCheck } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { ROUTES } from '@/lib/constants/routes'
import { cn } from '@/lib/utils'

interface AccountExistsCardProps {
  reason: 'email' | 'cpf'
  emailHint?: string
  onDismiss?: () => void
}

export function AccountExistsCard({
  reason,
  emailHint,
  onDismiss,
}: AccountExistsCardProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const Icon = reason === 'email' ? UserCheck : Fingerprint
  const normalizedEmail = emailHint?.trim()

  const { loginHref, forgotPasswordHref } = useMemo(() => {
    // CPF nunca prefilla email — emailHint so e valido quando reason === 'email'.
    const emailQuery =
      reason === 'email' && normalizedEmail
        ? `?email=${encodeURIComponent(normalizedEmail)}`
        : ''

    return {
      loginHref: `${ROUTES.LOGIN}${emailQuery}`,
      forgotPasswordHref: `${ROUTES.FORGOT_PASSWORD}${emailQuery}`,
    }
  }, [normalizedEmail, reason])

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <section
      data-testid="account-exists-card"
      role="status"
      aria-live="polite"
      className="relative mx-auto flex w-full max-w-sm flex-col gap-4 rounded-lg border border-[#F0B90B]/40 bg-[#1E2329] p-5 shadow-[0_12px_32px_rgba(0,0,0,.28)]"
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dispensar aviso"
          className="absolute right-2 top-2 flex min-h-11 min-w-11 items-center justify-center rounded-md text-[#929AA5] transition-colors hover:bg-[#2B3139] hover:text-[#EAECEF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      <div className="flex items-start gap-3 pr-10">
        <Icon className="mt-0.5 h-6 w-6 shrink-0 text-[#F0B90B]" aria-hidden="true" />

        <div className="min-w-0">
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="text-base font-semibold leading-snug text-[#EAECEF] focus:outline-none"
          >
            {reason === 'email'
              ? 'Você já tem conta no FootStock'
              : 'Já existe uma conta com este CPF'}
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-[#929AA5]">
            Faça login com sua conta existente ou recupere sua senha se esqueceu.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Link com classes de Button: evita <a><button> aninhado (Pegadinha 1 do Codex). */}
        <Link
          href={loginHref}
          data-testid="account-exists-login-cta"
          className={cn(
            buttonVariants({ variant: 'primary', size: 'lg', fullWidth: true }),
            'min-h-12'
          )}
        >
          Fazer login
        </Link>

        <Link
          href={forgotPasswordHref}
          data-testid="account-exists-forgot-link"
          className="self-center text-xs font-medium text-[#F0B90B] underline underline-offset-4 transition-colors hover:text-[#FCD535] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]"
        >
          Esqueci minha senha
        </Link>
      </div>
    </section>
  )
}
