'use client'

import { useState, useCallback } from 'react'
import { TOAST_DURATION_MS } from '@/lib/constants/timing'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  variant: ToastVariant
  title: string
  message?: string
}

function createToastId(): string {
  const maybeCrypto = globalThis.crypto as
    | { randomUUID?: () => string; getRandomValues?: (arr: Uint8Array) => Uint8Array }
    | undefined

  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID()
  }

  if (maybeCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16)
    maybeCrypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** Hook para gerenciar toasts — auto-dismiss apos TOAST_DURATION_MS */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = createToastId()
    setToasts((prev) => [...prev, { ...toast, id }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, TOAST_DURATION_MS)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = {
    success: (title: string, message?: string) =>
      addToast({ variant: 'success', title, message }),
    error: (title: string, message?: string) => addToast({ variant: 'error', title, message }),
    warning: (title: string, message?: string) =>
      addToast({ variant: 'warning', title, message }),
    info: (title: string, message?: string) => addToast({ variant: 'info', title, message }),
  }

  return { toasts, toast, removeToast }
}
