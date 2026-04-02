'use client'
// ============================================================================
// Foot Stock — LogoutButton
// Botão de logout reutilizável para todos os portais.
// Aceita redirectTo para personalizar destino pós-logout.
// ============================================================================

import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { signOut } from '@/lib/auth'

interface LogoutButtonProps {
  className?: string
  label?: string
  iconSize?: number
}

export function LogoutButton({ className, label = 'Sair', iconSize = 18 }: LogoutButtonProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await signOut()
    } catch {
      setIsLoggingOut(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleLogout()}
      disabled={isLoggingOut}
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors min-h-[44px]',
        isLoggingOut
          ? 'cursor-not-allowed text-zinc-600'
          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100',
        className
      )}
      aria-label="Sair da conta"
      title="Sair"
    >
      <LogOut size={iconSize} aria-hidden="true" />
      <span>{isLoggingOut ? 'Saindo...' : label}</span>
    </button>
  )
}
