'use client'
// ============================================================================
// Foot Stock — SubmitButton
// Botão de submit que usa useFormStatus para desabilitar durante Server Action.
// ============================================================================

import { useFormStatus } from 'react-dom'
import { Btn } from './Btn'
import type { BtnVariant, BtnSize } from './Btn'

interface SubmitButtonProps {
  children: React.ReactNode
  loadingText?: string
  variant?: BtnVariant
  size?: BtnSize
  fullWidth?: boolean
  className?: string
}

/**
 * Botão de submit com loading automático via useFormStatus.
 * Deve ser filho direto de um <form action={serverAction}>.
 */
export function SubmitButton({
  children,
  loadingText,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Btn
      type="submit"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      isLoading={pending}
      aria-disabled={pending}
      className={className}
    >
      {pending && loadingText ? loadingText : children}
    </Btn>
  )
}
