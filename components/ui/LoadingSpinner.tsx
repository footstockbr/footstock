'use client'

import { cn } from '@/lib/utils/cn'

export interface LoadingSpinnerProps {
  /** Tamanho do spinner */
  size?: 'sm' | 'md' | 'lg'
  /** Classe CSS adicional */
  className?: string
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
}

/** Spinner de carregamento animado */
export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <svg
      className={cn('animate-spin text-accent', sizeMap[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
      role="status"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
