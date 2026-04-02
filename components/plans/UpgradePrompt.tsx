'use client'

// ============================================================================
// Foot Stock — UpgradePrompt: modal de features bloqueadas com CTA de upgrade
// Requer Modal do module-2; hook useUpgradePrompt exportado para reutilização
// ============================================================================

import { useRouter } from 'next/navigation'
import type { PlanType } from '@/lib/enums'
import { Modal } from '@/components/ui/Modal'
import { Btn } from '@/components/ui/Btn'
import { calcBonusAmount } from '@/lib/services/plan-logic'
import { FEATURE_TO_PLAN } from '@/hooks/useUpgradePrompt'

// ─── Configuração de planos ──────────────────────────────────────────────────

const PLAN_LABEL: Record<PlanType, string> = {
  JOGADOR: 'Jogador',
  CRAQUE: 'Craque',
  LENDA: 'Lenda',
}

const PLAN_BENEFITS: Record<Exclude<PlanType, 'JOGADOR'>, string[]> = {
  CRAQUE: [
    'Ordens limitadas e agendadas',
    'Cotações com 30 minutos de atraso',
    'Modo comparação de ativos',
    'Assessor IA básico',
    'Ligas privadas de amigos',
    'Bandas de Bollinger',
    `Bônus de FS$${calcBonusAmount('CRAQUE').toLocaleString('pt-BR')} ao assinar`,
  ],
  LENDA: [
    'Short Selling e alavancagem 2x',
    'Cotação em tempo real',
    'Ordens OCO (Stop Loss + Take Profit)',
    'MM9 + MM21',
    'Assessor IA VIP com web search',
    'Ligas PRO patrocinadas',
    `Bônus de FS$${calcBonusAmount('LENDA').toLocaleString('pt-BR')} ao assinar`,
  ],
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface UpgradePromptProps {
  isOpen: boolean
  blockedFeature: string | null
  currentPlan: PlanType
  onClose: () => void
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function UpgradePrompt({ isOpen, blockedFeature, currentPlan, onClose }: UpgradePromptProps) {
  const router = useRouter()

  const suggestedPlan: PlanType = blockedFeature
    ? (FEATURE_TO_PLAN[blockedFeature] ?? 'CRAQUE')
    : 'CRAQUE'

  const isMappedFeature = blockedFeature != null && blockedFeature in FEATURE_TO_PLAN
  const bonusAmount = calcBonusAmount(suggestedPlan)
  const benefits = suggestedPlan !== 'JOGADOR' ? PLAN_BENEFITS[suggestedPlan] : []

  const handleUpgrade = () => {
    onClose()
    router.push(isMappedFeature ? `/planos?plan=${suggestedPlan}` : '/planos')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Funcionalidade bloqueada"
      size="md"
    >
      <div className="space-y-4">
        {/* Feature bloqueada em destaque */}
        <div className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-3">
          <span className="text-lg shrink-0" aria-hidden="true">🔒</span>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {isMappedFeature
                ? `"${blockedFeature}" requer o plano ${PLAN_LABEL[suggestedPlan]}`
                : 'Esta funcionalidade requer um plano superior'}
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              Você está no plano{' '}
              <span className="font-semibold text-text-primary">{PLAN_LABEL[currentPlan]}</span>
            </p>
          </div>
        </div>

        {/* Card de comparação */}
        {suggestedPlan !== 'JOGADOR' && (
          <div className="rounded-lg border border-border-default p-3 space-y-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              Plano {PLAN_LABEL[suggestedPlan]} inclui:
            </p>
            <ul className="space-y-1.5" role="list">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-sm text-text-primary">
                  <span className="text-green-400 shrink-0" aria-hidden="true">✓</span>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Destaque do bônus */}
        {suggestedPlan !== 'JOGADOR' && (
          <p className="text-center text-sm font-medium text-yellow-400">
            🪙 Ganhe FS${bonusAmount.toLocaleString('pt-BR')} ao assinar{' '}
            <span className="font-bold">{PLAN_LABEL[suggestedPlan]}</span>!
          </p>
        )}

        {/* Footer */}
        <div className="flex flex-col gap-2 pt-1">
          <Btn
            variant="primary"
            className="w-full"
            onClick={handleUpgrade}
            data-testid="btn-fazer-upgrade"
          >
            Fazer Upgrade para {PLAN_LABEL[suggestedPlan]}
          </Btn>
          <button
            type="button"
            className="text-xs text-text-secondary hover:text-text-primary underline text-center py-1"
            onClick={onClose}
            data-testid="btn-continuar-sem-upgrade"
          >
            Continuar sem fazer upgrade
          </button>
        </div>
      </div>
    </Modal>
  )
}
