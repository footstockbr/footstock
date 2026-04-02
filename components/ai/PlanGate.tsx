// ============================================================================
// Foot Stock — PlanGate (module-21/TASK-3/ST002 + TASK-4/ST006)
// Gate de plano para o Assessor IA — overlay blur para usuários Jogador
// Focus trap implementado para acessibilidade (TASK-4 GAP-003)
// ============================================================================

'use client'

import { type ReactNode, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { Btn } from '@/components/ui/Btn'
import { PLAN_TYPE, type PlanType } from '@/lib/enums'
import { ROUTES } from '@/lib/constants'

// Prévia estática de análise mock (visível atrás do overlay para incentivar upgrade)
function MockAnalysisPreview() {
  return (
    <div className="pointer-events-none select-none space-y-3 opacity-60" aria-hidden="true">
      <div className="flex gap-2">
        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-400">COMPRAR</span>
        <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs text-yellow-400">RISCO MÉDIO</span>
      </div>
      <div className="space-y-1">
        <div className="h-3 w-full rounded bg-[#1e2a3a]" />
        <div className="h-3 w-[85%] rounded bg-[#1e2a3a]" />
        <div className="h-3 w-[70%] rounded bg-[#1e2a3a]" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-3 rounded bg-[#1e2a3a]" />
        ))}
      </div>
    </div>
  )
}

interface PlanGateProps {
  userPlan: PlanType | null | undefined
  children: ReactNode
}

/**
 * Renderiza children normalmente para planos Craque e Lenda.
 * Para Jogador (ou plano nulo/indefinido — fail-safe), exibe overlay blur
 * com prévia bloqueada, focus trap e CTA de upgrade para /planos.
 */
export function PlanGate({ userPlan, children }: PlanGateProps) {
  const isBlocked = !userPlan || userPlan === PLAN_TYPE.JOGADOR
  const overlayRef = useRef<HTMLDivElement>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)

  // Focus trap: focar no link de upgrade ao montar overlay
  useEffect(() => {
    if (isBlocked && linkRef.current) {
      linkRef.current.focus()
    }
  }, [isBlocked])

  // Focus trap: prender Tab dentro do overlay
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !overlayRef.current) return

    const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (focusable.length === 0) return

    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  if (!isBlocked) return <>{children}</>

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#1e2a3a] bg-[#0f1923] p-5">
      {/* Prévia desfocada atrás do overlay — inert para impedir interação */}
      <div inert>
        <MockAnalysisPreview />
      </div>

      {/* Overlay blur com focus trap */}
      <div
        ref={overlayRef}
        className="absolute inset-0 flex items-center justify-center bg-[#0B0E11]/80 backdrop-blur-sm"
        aria-modal="true"
        role="dialog"
        aria-label="Conteúdo bloqueado — plano Craque ou superior necessário"
        onKeyDown={handleKeyDown}
      >
        <div className="mx-4 max-w-sm rounded-2xl border border-[#1e2a3a] bg-[#0f1923] p-6 text-center shadow-2xl">
          <Lock className="mx-auto mb-3 h-8 w-8 text-amber-400" aria-hidden="true" />
          <h3 className="mb-1 text-base font-semibold text-slate-100">
            Assessor IA
          </h3>
          <p className="mb-4 text-sm text-slate-400">
            Disponível a partir do plano <span className="font-semibold text-amber-400">Craque</span>.
          </p>
          <Link ref={linkRef} href={ROUTES.PLANOS ?? '/planos'} className="focus-visible:outline-none">
            <Btn
              variant="primary"
              size="md"
              className="w-full"
            >
              Fazer Upgrade
            </Btn>
          </Link>
        </div>
      </div>
    </div>
  )
}
