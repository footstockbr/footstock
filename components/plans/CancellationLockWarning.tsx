'use client'

// ============================================================================
// Foot Stock — CancellationLockWarning: aviso de trava de cancelamento 48h
// GAP-003: focus trap implementado para acessibilidade
// GAP-004: isCancelling prop para loading state no botão de confirmação
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { Btn } from '@/components/ui/Btn'

interface Position {
  ativo: string
  tipo: string
  quantidade: number
  valorEstimado: number
}

interface CancellationLockWarningProps {
  positions: Position[]
  cancellationLockExpiresAt?: string | null  // ISO string — para CANCELLATION_LOCK ativa
  onConfirm: () => void
  onLiquidate: () => void
  onClose?: () => void
  /** Estado de loading durante o cancelamento */
  isCancelling?: boolean
}

const BLOCKED_FEATURES = [
  'Ordens Limitadas',
  'Ordens Agendadas',
  'OCO',
  'Short Selling',
  'Alavancagem 2x',
  'Assessor IA',
  'Ligas PRO',
]

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

function useCountdown(expiresAt: string | null | undefined) {
  const getRemaining = useCallback(() => {
    if (!expiresAt) {
      // Se sem expiresAt, countdown a partir de agora + 48h (estimativa)
      return 48 * 60 * 60 * 1000
    }
    return Math.max(0, new Date(expiresAt).getTime() - Date.now())
  }, [expiresAt])

  const [remaining, setRemaining] = useState(getRemaining)

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(getRemaining())
    }, 1000)
    return () => clearInterval(interval)
  }, [getRemaining])

  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  return { hours, minutes, isExpired: remaining === 0 }
}

export function CancellationLockWarning({
  positions,
  cancellationLockExpiresAt,
  onConfirm,
  onLiquidate,
  onClose,
  isCancelling = false,
}: CancellationLockWarningProps) {
  const { hours, minutes, isExpired } = useCountdown(cancellationLockExpiresAt)
  const modalRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // GAP-003: Focus trap — captura foco ao abrir, cicla com Tab, ESC fecha
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null

    const modalEl = modalRef.current
    if (!modalEl) return

    // Foco inicial no primeiro elemento focável
    const focusableElements = modalEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    const firstFocusable = focusableElements[0]
    if (firstFocusable) {
      firstFocusable.focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }

      if (e.key !== 'Tab') return

      const focusable = Array.from(modalEl!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return

      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!

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
      // Restaurar foco ao elemento anterior
      previousFocusRef.current?.focus()
    }
  }, [onClose])

  return (
    <div
      role="alertdialog"
      aria-label="Aviso de trava de cancelamento"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60"
    >
      <div
        ref={modalRef}
        className="bg-gray-900 border border-red-800 rounded-xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-700">
          <span className="text-2xl" aria-hidden="true">⚠️</span>
          <h2 className="text-base font-semibold text-red-400">Cancelamento com trava de 48h</h2>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-auto text-gray-400 hover:text-white"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          )}
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Countdown */}
          <div className="bg-red-950/40 border border-red-800/50 rounded-lg p-4 text-center">
            {isExpired ? (
              <p className="text-red-400 font-medium">Prazo expirado — liquidação em andamento...</p>
            ) : (
              <>
                <p className="text-sm text-gray-300 mb-1">Você tem para liquidar manualmente antes da venda automática:</p>
                <p className="text-2xl font-bold text-red-300 tabular-nums">
                  {String(hours).padStart(2, '0')}h {String(minutes).padStart(2, '0')}min
                </p>
              </>
            )}
          </div>

          {/* Features bloqueadas imediatamente */}
          <div>
            <h3 className="text-sm font-semibold text-gray-200 mb-2">Features bloqueadas imediatamente:</h3>
            <ul className="grid grid-cols-2 gap-1">
              {BLOCKED_FEATURES.map((f) => (
                <li key={f} className="text-xs text-red-400 flex items-center gap-1">
                  <span aria-hidden="true">✗</span> {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Posições em venda compulsória */}
          <div>
            <h3 className="text-sm font-semibold text-gray-200 mb-2">
              Posições em venda compulsória após 48h:
            </h3>
            {positions.length === 0 ? (
              <p className="text-sm text-green-400">Nenhuma posição incompatível. Cancelamento simples.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-1 pr-2">Ativo</th>
                        <th className="text-left py-1 pr-2">Tipo</th>
                        <th className="text-right py-1 pr-2">Qtd</th>
                        <th className="text-right py-1">Valor Est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="py-1 pr-2 font-medium text-white">{pos.ativo}</td>
                          <td className="py-1 pr-2 text-orange-400">{pos.tipo}</td>
                          <td className="py-1 pr-2 text-right">{pos.quantidade}</td>
                          <td className="py-1 text-right">
                            FS${pos.valorEstimado.toLocaleString('pt-BR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Aviso de risco de slippage na liquidação automática */}
                <div className="mt-3 rounded-lg bg-orange-950/40 border border-orange-800/60 p-3">
                  <p className="text-xs text-orange-300 font-semibold mb-1">⚠️ Risco de slippage na liquidação automática</p>
                  <p className="text-xs text-orange-200/80">
                    A venda compulsória ocorre a <strong>preço de mercado</strong> e pode ser executada
                    em momento desfavorável (ex: leilão de fechamento, baixa liquidez).
                    O valor final pode ser inferior ao estimado acima.
                  </p>
                  <p className="text-xs text-orange-200/80 mt-1">
                    <strong>Como liquidar manualmente:</strong> acesse <em>Carteira → Posições</em>,
                    selecione cada posição SHORT/OCO e execute a venda antes do prazo expirar.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-700 flex flex-col gap-2" id="cancellation-consequences">
          <Btn
            variant="secondary"
            className="w-full border-yellow-600 text-yellow-400 hover:bg-yellow-900/20"
            onClick={onLiquidate}
            disabled={isCancelling}
            data-testid="btn-liquidar"
          >
            Liquidar manualmente
          </Btn>
          <Btn
            variant="ghost"
            className="w-full text-red-400 hover:bg-red-900/20 text-sm"
            aria-describedby="cancellation-consequences"
            onClick={onConfirm}
            disabled={isCancelling}
            data-testid="btn-confirmar-cancelamento"
          >
            {isCancelling ? 'Cancelando...' : 'Entendi, confirmar cancelamento'}
          </Btn>
        </div>
      </div>
    </div>
  )
}
