'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SplashScreen } from '@/components/auth/SplashScreen'
import { LoginForm } from '@/components/auth/LoginForm'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { getSession } from '@/lib/auth/session'
import { ROUTES } from '@/lib/constants/routes'

type PageState = 'splash' | 'checking-auth' | 'show-login' | 'redirecting'

export default function AuthPage() {
  const router = useRouter()
  const [state, setState] = useState<PageState>('splash')

  const checkAuth = useCallback(async () => {
    setState('checking-auth')
    try {
      const session = await getSession()
      if (session) {
        setState('redirecting')
        router.replace(ROUTES.DASHBOARD)
      } else {
        setState('show-login')
      }
    } catch {
      setState('show-login')
    }
  }, [router])

  const handleSplashComplete = useCallback(() => {
    checkAuth()
  }, [checkAuth])

  if (state === 'splash') {
    return <SplashScreen onComplete={handleSplashComplete} />
  }

  if (state === 'checking-auth' || state === 'redirecting') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return <LoginForm />
}
