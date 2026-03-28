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

/** Hook para gerenciar toasts — auto-dismiss apos TOAST_DURATION_MS */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
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
