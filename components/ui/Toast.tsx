'use client'

import { cn } from '@/lib/utils/cn'
import type { Toast as ToastType } from '@/hooks/useToast'

interface ToastItemProps {
  /** Dados do toast a ser renderizado */
  toast: ToastType
  /** Callback para fechar o toast */
  onDismiss: (id: string) => void
}

const variantStyles = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-error/30 bg-error/10 text-error',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info',
}

/** Item individual de toast com botao de fechar */
export function ToastItem({ toast, onDismiss }: ToastItemProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border',
        'min-w-[280px] max-w-[360px]',
        'animate-fade-in',
        variantStyles[toast.variant]
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.message && <p className="text-xs opacity-80 mt-0.5">{toast.message}</p>}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-current opacity-60 hover:opacity-100 flex-shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center -m-2"
        aria-label="Fechar notificacao"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
}

interface ToastContainerProps {
  /** Lista de toasts ativos */
  toasts: ToastType[]
  /** Callback para fechar um toast */
  onDismiss: (id: string) => void
}

/** Container fixo no canto inferior direito para toasts */
export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div
      className="fixed bottom-20 right-4 z-toast flex flex-col gap-2"
      aria-label="Notificacoes"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
