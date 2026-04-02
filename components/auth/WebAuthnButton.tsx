'use client'

import { useState, useEffect, useCallback } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'
import { apiClient } from '@/lib/api/client'
import { Btn } from '@/components/ui/Btn'
import { STORAGE_KEYS } from '@/lib/constants/storage-keys'

interface WebAuthnButtonProps {
  email: string
  onError: (msg: string) => void
  onSuccess: () => void
}

export function WebAuthnButton({ email, onError, onSuccess }: WebAuthnButtonProps) {
  const [isAvailable, setIsAvailable] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Verificar se WebAuthn esta disponivel e habilitado para este email
    const checkAvailability = () => {
      if (typeof window === 'undefined') return false
      if (!window.PublicKeyCredential) return false

      const enabled = localStorage.getItem(STORAGE_KEYS.LOCAL.WEBAUTHN_ENABLED(email))
      return enabled === 'true'
    }

    setIsAvailable(checkAvailability())
  }, [email])

  const handleAuthenticate = useCallback(async () => {
    setIsLoading(true)
    try {
      // Step 1: Init — obter opcoes de autenticacao
      const initResponse = await apiClient.post(
        '/api/v1/auth/webauthn/authenticate',
        { email, step: 'init' }
      )

      const options = initResponse.data.data.options

      // Step 2: Autenticar com o dispositivo
      const authResponse = await startAuthentication(options)

      // Step 3: Verificar no servidor
      const verifyResponse = await apiClient.post(
        '/api/v1/auth/webauthn/authenticate',
        { email, step: 'verify', response: authResponse }
      )

      if (verifyResponse.data.success) {
        onSuccess()
      }
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ||
        'Nao foi possivel autenticar com biometria. Tente com sua senha.'
      onError(message)
    } finally {
      setIsLoading(false)
    }
  }, [email, onError, onSuccess])

  if (!isAvailable) return null

  return (
    <div className="w-full">
      <div className="relative flex items-center gap-3 my-2">
        <div className="flex-1 h-px bg-border-default" />
        <span className="text-xs text-text-secondary">ou</span>
        <div className="flex-1 h-px bg-border-default" />
      </div>

      <Btn
        type="button"
        variant="secondary"
        onClick={handleAuthenticate}
        isLoading={isLoading}
        className="w-full min-h-[44px] flex items-center justify-center gap-2"
      >
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
          <path d="M12 10V4a2 2 0 0 0-4 0v6" />
          <path d="M18 16a6 6 0 0 0-12 0" />
          <path d="M12 10a4 4 0 0 1 4 4v2" />
          <path d="M8 14v2" />
          <circle cx="12" cy="20" r="1" />
        </svg>
        Entrar com biometria
      </Btn>
    </div>
  )
}
