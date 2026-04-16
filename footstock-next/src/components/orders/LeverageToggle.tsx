'use client'

// ============================================================================
// FootStock — LeverageToggle
// Toggle de alavancagem 2x — exclusivo para usuários Lenda em ordens BUY.
// Mostra estimativa de juros diários e aviso de risco antes de ativar.
// Rastreabilidade: T-003 / INT-TRD-005
// ============================================================================

import { useEffect } from 'react'
import { AlertTriangle, TrendingUp, Lock } from 'lucide-react'
import Link from 'next/link'
import { LEVERAGE_DAILY_INTEREST_RATE } from '@/lib/constants/leverage'
import { useAnalytics } from '@/hooks/useAnalytics'

interface LeverageToggleProps {
  isLenda: boolean
  enabled: boolean
  onToggle: (enabled: boolean) => void
  operationValue: number
  plan: string
}

export function LeverageToggle({
  isLenda,
  enabled,
  onToggle,
  operationValue,
  plan,
}: LeverageToggleProps) {
  const { track } = useAnalytics()

  // Crédito virtual = metade do valor da operação (plataforma financia 50%)
  const leverageAmount = operationValue / 2
  const dailyInterestEstimate = leverageAmount * LEVERAGE_DAILY_INTEREST_RATE

  // EVT-015: upgrade_prompt_shown — when the locked state is rendered
  useEffect(() => {
    if (!isLenda) {
      track('upgrade_prompt_shown', {
        feature_blocked: 'leverage_2x',
        current_plan: plan as 'JOGADOR' | 'CRAQUE' | 'LENDA',
        required_plan: 'LENDA',
      })
    }
  }, [isLenda, track, plan])

  // Usuários sem plano Lenda veem o toggle bloqueado com CTA de upgrade
  if (!isLenda) {
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(240,185,11,.15)] bg-[rgba(240,185,11,.04)] p-3"
        data-testid="leverage-toggle-locked"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Lock className="h-4 w-4 text-[#F0B90B] flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#EAECEF]">Alavancagem 2x</p>
            <p className="text-xs text-[#929AA5]">Requer plano Lenda</p>
          </div>
        </div>
        <Link
          href="/planos"
          className="shrink-0 rounded-md bg-[#F0B90B] px-3 py-1.5 text-xs font-semibold text-[#0B0E11] transition-colors hover:bg-[#F0B90B]/90 whitespace-nowrap"
          onClick={() => {
            // EVT-019: plan_upgrade_clicked
            track('plan_upgrade_clicked', {
              origin: 'leverage_2x',
              current_plan: plan as 'JOGADOR' | 'CRAQUE' | 'LENDA',
            })
          }}
        >
          Fazer upgrade
        </Link>
      </div>
    )
  }

  return (
    <div
      className="space-y-2 rounded-lg border border-[rgba(240,185,11,.18)] bg-[rgba(240,185,11,.04)] p-3"
      data-testid="leverage-toggle"
    >
      {/* Linha do toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[#F0B90B]" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-[#EAECEF]">Alavancagem 2x</p>
            <p className="text-xs text-[#929AA5]">
              Opera com o dobro do capital disponível
            </p>
          </div>
        </div>

        {/* Switch acessivel */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Ativar alavancagem 2x"
          onClick={() => onToggle(!enabled)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[rgba(240,185,11,.5)] ${
            enabled ? 'bg-[#F0B90B]' : 'bg-[#2B3139]'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
              enabled ? 'translate-x-[22px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </div>

      {/* Detalhes quando ativo */}
      {enabled && operationValue > 0 && (
        <div className="border-t border-[rgba(240,185,11,.15)] pt-2 space-y-2">
          {/* Estimativa de juros */}
          <div className="flex justify-between text-xs text-[#929AA5]">
            <span>Crédito utilizado (50% da operação):</span>
            <span className="font-mono text-[#EAECEF]">FS$ {leverageAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs text-[#929AA5]">
            <span>
              Juros diários estimados ({(LEVERAGE_DAILY_INTEREST_RATE * 100).toFixed(1)}%/dia):
            </span>
            <span className="font-mono text-[#F6465D]">
              -FS$ {dailyInterestEstimate.toFixed(4)}
            </span>
          </div>

          {/* Aviso de risco */}
          <div className="flex items-start gap-2 rounded-md bg-[rgba(246,70,93,.08)] p-2">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F6465D]"
              aria-hidden="true"
            />
            <p className="text-xs text-[#F6465D]">
              O crédito de alavancagem é virtual e sem conversão para reais. Perdas superiores a
              80% do crédito resultam em liquidação automática da posição.
            </p>
          </div>
        </div>
      )}

      {enabled && operationValue <= 0 && (
        <p className="text-xs text-[#929AA5] border-t border-[rgba(240,185,11,.15)] pt-2">
          Informe a quantidade para ver a estimativa de juros.
        </p>
      )}
    </div>
  )
}

