'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils/cn'

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'plan'
export type BtnSize = 'sm' | 'md' | 'lg'

export interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Variante visual do botao */
  variant?: BtnVariant
  /** Tamanho do botao */
  size?: BtnSize
  /** Exibe spinner e desabilita o botao */
  isLoading?: boolean
  /** Icone a esquerda do texto */
  leftIcon?: React.ReactNode
  /** Icone a direita do texto */
  rightIcon?: React.ReactNode
  /** Preenche a largura do container */
  fullWidth?: boolean
}

const variantStyles: Record<BtnVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:opacity-90 shadow-md',
  secondary:
    'bg-bg-elevated border border-border-default text-text-primary hover:border-accent hover:text-accent',
  ghost: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-surface',
  destructive: 'bg-error text-white hover:opacity-90 active:opacity-80',
  plan: 'bg-accent-gold text-bg-primary font-semibold hover:bg-accent-gold-hover',
}

const sizeStyles: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

/**
 * Botao principal do design system Foot Stock.
 * Mobile-first: altura minima de 40px (touch target).
 */
const Btn = forwardRef<HTMLButtonElement, BtnProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={isLoading}
        className={cn(
          'inline-flex items-center justify-center',
          'font-medium rounded-md',
          'transition-all duration-fast',
          'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
          'select-none cursor-pointer',
          isDisabled && 'opacity-50 cursor-not-allowed pointer-events-none',
          fullWidth && 'w-full',
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
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
            <span className="sr-only">Carregando...</span>
          </>
        ) : (
          <>
            {leftIcon && <span aria-hidden="true">{leftIcon}</span>}
            {children}
            {rightIcon && <span aria-hidden="true">{rightIcon}</span>}
          </>
        )}
      </button>
    )
  }
)

Btn.displayName = 'Btn'

export { Btn }
