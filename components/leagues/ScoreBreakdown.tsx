'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { ScoreBreakdown as ScoreBreakdownType } from '@/types'

interface Props {
  score: ScoreBreakdownType
  userName?: string
  onClose: () => void
  triggerRef: React.RefObject<HTMLElement>
}

interface Pillar {
  key: keyof Omit<ScoreBreakdownType, 'total' | 'finalScore' | 'fatorEquidade'>
  label: string
  max: number
  color: string
}

const PILLARS: Pillar[] = [
  { key: 'rentabilidade',  label: 'Rentabilidade',  max: 35, color: 'bg-emerald-500' },
  { key: 'sofisticacao',   label: 'Sofisticação',   max: 25, color: 'bg-blue-500'    },
  { key: 'diversificacao', label: 'Diversificação', max: 20, color: 'bg-purple-500'  },
  { key: 'consistencia',   label: 'Consistência',   max: 15, color: 'bg-amber-500'   },
  { key: 'bonusEducativo', label: 'Bônus Educativo',max: 5,  color: 'bg-rose-500'    },
]

export function ScoreBreakdown({ score, userName, onClose, triggerRef }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Focus trap + Escape key
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return

      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Return focus to trigger
      ;(triggerRef.current ?? previouslyFocused)?.focus()
    }
  }, [onClose, triggerRef])

  // Click outside to close
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid immediate close from the same click that opened
    const id = setTimeout(() => document.addEventListener('pointerdown', handlePointerDown), 0)
    return () => {
      clearTimeout(id)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [onClose])

  const title = userName ? `Score de ${userName}` : 'Breakdown de Score'

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className="fixed inset-0 bg-black/50 z-40 sm:hidden"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          // Mobile: bottom sheet
          'fixed bottom-0 left-0 right-0 z-50',
          'rounded-t-2xl bg-[#1a1816] border-t border-[#2a2724]',
          'p-5 pb-8',
          // Desktop: popover above trigger
          'sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-auto',
          'sm:rounded-xl sm:border sm:border-[#2a2724]',
          'sm:w-80 sm:p-4 sm:pb-4',
          'sm:shadow-2xl sm:shadow-black/60'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#EAECEF]">{title}</h3>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-[#EAECEF] hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0B90B]"
            aria-label="Fechar breakdown de score"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Score total */}
        <div className="flex items-baseline gap-2 mb-4">
          <span
            className="text-3xl font-bold text-[#F0B90B]"
            aria-label={`Score final: ${score.finalScore.toFixed(1)} pontos`}
          >
            {score.finalScore.toFixed(1)}
          </span>
          <span className="text-xs text-gray-500">/ 100 pts</span>
          {score.fatorEquidade !== 1 && (
            <span className="ml-auto text-xs text-gray-500">
              ×{score.fatorEquidade.toFixed(1)} equidade
            </span>
          )}
        </div>

        {/* Pillars */}
        <ul className="space-y-3" aria-label="Detalhes por pilar">
          {PILLARS.map(({ key, label, max, color }) => {
            const value = score[key] as number
            const pct = Math.round((value / max) * 100)

            return (
              <li key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{label}</span>
                  <span className="text-xs font-medium text-[#EAECEF]">
                    {value.toFixed(1)}/{max}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full bg-white/10 overflow-hidden"
                  role="progressbar"
                  aria-label={`${label}: ${value.toFixed(1)} de ${max} pontos`}
                  aria-valuenow={value}
                  aria-valuemin={0}
                  aria-valuemax={max}
                >
                  <div
                    className={cn('h-full rounded-full transition-all', color)}
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </div>
              </li>
            )
          })}
        </ul>

        {/* Footer note */}
        <p className="mt-4 text-[10px] text-gray-600 leading-tight">
          Score calculado com fator de equidade por divisão. Atualizado a cada hora.
        </p>
      </div>
    </>
  )
}
