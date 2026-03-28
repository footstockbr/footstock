'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils/cn'

export interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /** Altura maxima como % da viewport */
  maxHeight?: string
  className?: string
}

/**
 * Bottom sheet drawer para mobile.
 * Desliza de baixo para cima com swipe handle.
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = '80vh',
  className,
}: DrawerProps) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-bg-overlay z-modal"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Menu'}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-modal',
          'bg-bg-card border-t border-border-default',
          'rounded-t-2xl',
          'animate-slide-up',
          'overflow-y-auto',
          className
        )}
        style={{ maxHeight }}
      >
        {/* Swipe handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-border-default" aria-hidden="true" />
        </div>

        {title && (
          <div className="px-5 pb-3 border-b border-border-default">
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          </div>
        )}

        <div className="px-5 py-4 pb-safe">{children}</div>
      </div>
    </>
  )
}
