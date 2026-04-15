// T-019: Hook para obter saldo FS$ do usuário autenticado
'use client'

import { useEffect, useState } from 'react'

interface BalanceState {
  fsBalance: number | null
  isLoading: boolean
}

export function useBalance(): BalanceState {
  const [fsBalance, setFsBalance] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchBalance() {
      try {
        const res = await fetch('/api/v1/me', { cache: 'no-store', credentials: 'include' })
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) {
          setFsBalance(json.data?.fsBalance ?? null)
        }
      } catch {
        // silencioso — componente renderiza sem estado de saldo
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchBalance()
    return () => { cancelled = true }
  }, [])

  return { fsBalance, isLoading }
}
