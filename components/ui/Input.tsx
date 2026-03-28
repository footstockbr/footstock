'use client'

import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils/cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label exibido acima do input */
  label?: string
  /** Mensagem de erro — exibe borda vermelha e texto abaixo */
  error?: string
  /** Texto de ajuda exibido abaixo do input (oculto quando error existe) */
  hint?: string
  /** Elemento a esquerda dentro do input (icone) */
  leftElement?: React.ReactNode
  /** Elemento a direita dentro do input (icone) */
  rightElement?: React.ReactNode
}

/**
 * Input do design system com suporte a label, erro e hints.
 * Altura minima 44px para touch targets mobile.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftElement, rightElement, className, id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-secondary">
            {label}
            {props.required && (
              <span className="text-error ml-1" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}

        <div className="relative flex items-center">
          {leftElement && (
            <div className="absolute left-3 text-text-muted" aria-hidden="true">
              {leftElement}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={
              [error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined
            }
            className={cn(
              'w-full h-11',
              'bg-bg-surface border border-border-default rounded-md',
              'px-3 py-2 text-sm text-text-primary',
              'placeholder:text-text-muted',
              'transition-colors duration-fast',
              'focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/30',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-border-error focus:border-border-error focus:ring-error/30',
              leftElement && 'pl-10',
              rightElement && 'pr-10',
              className
            )}
            {...props}
          />

          {rightElement && (
            <div className="absolute right-3 text-text-muted" aria-hidden="true">
              {rightElement}
            </div>
          )}
        </div>

        {hint && !error && (
          <p id={hintId} className="text-xs text-text-muted">
            {hint}
          </p>
        )}

        {error && (
          <p id={errorId} role="alert" className="text-xs text-error flex items-center gap-1">
            <svg
              className="w-3 h-3 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {error}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
