'use client'

// ============================================================================
// Foot Stock — MotorStatusContext
// Propaga o status do motor para toda a árvore de componentes.
// O OrderForm (module-14) DEVE importar useMotorStatusContext() e
// desabilitar o botão "Confirmar Ordem" quando isOffline === true.
// ============================================================================

import { createContext, useContext, type ReactNode } from 'react'
import { useMotorStatus, type UseMotorStatusReturn } from '@/hooks/useMotorStatus'

const MotorStatusContext = createContext<UseMotorStatusReturn>({
  isOnline: false,
  isOffline: false,
  lastTick: null,
  isLoading: true,
})

export function MotorStatusProvider({ children }: { children: ReactNode }) {
  const status = useMotorStatus()

  return (
    <MotorStatusContext.Provider value={status}>
      {children}
    </MotorStatusContext.Provider>
  )
}

export function useMotorStatusContext(): UseMotorStatusReturn {
  return useContext(MotorStatusContext)
}
