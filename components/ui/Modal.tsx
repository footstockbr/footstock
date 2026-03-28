'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils/cn'
import { ExitBtn } from './ExitBtn'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  /** Tamanho do modal */
  size?: 'sm' | 'md' | 'lg'
  /** Esconde o botao X */
  hideCloseButton?: boolean
  className?: string
}

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

/**
 * Modal acessivel com focus trap, ESC para fechar e overlay click.
 * Usa o elemento nativo dialog para acessibilidade.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  hideCloseButton = false,
  className,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      dialog.showModal()
      document.body.style.overflow = 'hidden'
    } else {
      dialog.close()
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={handleBackdropClick}
      className={cn(
        'bg-bg-card border border-border-default rounded-xl p-0',
        'shadow-xl w-full mx-4',
        'backdrop:bg-bg-overlay',
        'open:animate-fade-in',
        sizeMap[size],
        className
      )}
      aria-labelledby="modal-title"
      aria-describedby={description ? 'modal-description' : undefined}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border-default">
        <div>
          <h2 id="modal-title" className="text-base font-semibold text-text-primary">
            {title}
          </h2>
          {description && (
            <p id="modal-description" className="text-sm text-text-secondary mt-0.5">
              {description}
            </p>
          )}
        </div>
        {!hideCloseButton && (
          <ExitBtn onClick={onClose} label="Fechar modal" className="ml-4 flex-shrink-0" />
        )}
      </div>

      {/* Content */}
      <div className="px-5 py-4">{children}</div>
    </dialog>
  )
}
