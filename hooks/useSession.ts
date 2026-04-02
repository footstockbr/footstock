'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient, onAuthStateChange } from '@/lib/auth/session'
import { apiClient } from '@/lib/api/client'
import { ROUTES } from '@/lib/constants/routes'
import type { User } from '@/types/models'

interface UseSessionReturn {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

export function useSession(): UseSessionReturn {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadUser = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/v1/users/me')
      if (response.data?.data) {
        setUser(response.data.data)
      }
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const supabase = getSupabaseClient()
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session && mounted) {
          await loadUser()
        }
      } catch {
        // Sessao nao encontrada
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    init()

    const { data: { subscription } } = onAuthStateChange(
      (event: string) => {
        if (!mounted) return

        if (event === 'SIGNED_IN') {
          loadUser()
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          router.replace(ROUTES.HOME)
        }
        // TOKEN_REFRESHED — no-op
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadUser, router])

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  }
}
