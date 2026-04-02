'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROUTES } from '@/lib/constants/routes'
import { getSession } from '@/lib/auth/session'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export interface AuthGuardProps {
  children: React.ReactNode
}

/**
 * Guard de autenticacao — redireciona para login se o usuario nao estiver autenticado.
 * Exibe LoadingSpinner enquanto verifica a sessao.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    let cancelled = false

    getSession().then((session) => {
      if (cancelled) return

      if (!session) {
        router.replace(ROUTES.LOGIN)
      } else {
        setIsAuthenticated(true)
      }

      setIsChecking(false)
    })

    return () => {
      cancelled = true
    }
  }, [router])

  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <LoadingSpinner size="lg" />
        <span className="sr-only">Verificando autenticacao...</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
