'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ALREADY_HAS_PLAN_MESSAGE,
  NO_GATEWAY_MESSAGE,
  PENDING_PAYMENT_MESSAGE,
  resolveBlockMessage,
} from '@/components/payments/CheckoutButton'
import { useAnalytics } from '@/hooks/useAnalytics'
import { usePlanGuard } from '@/hooks/usePlanGuard'
import { useCheckoutGateways } from '@/hooks/useCheckoutGateways'
import type { CheckoutGateway } from '@/lib/constants/checkout-gateways'

type PlanType = 'CRAQUE' | 'LENDA'
type CurrentPlan = 'JOGADOR' | 'CRAQUE' | 'LENDA'
type Period = 'MONTHLY' | 'YEARLY'


const TIER_ORDER: Record<string, number> = {
  'JOGADOR': 0,
  'CRAQUE': 1,
  'LENDA': 2,
}

// M066 — shape do GET /api/v1/payments/upgrade-preview (disclosure do upgrade pago->pago).
interface UpgradePreview {
  currentPlan: string
  targetPlan: string
  amountDueTodayCents: number
  residualCents: number
  compensation: 'NONE' | 'FS_CREDIT' | 'PARTIAL_REFUND'
  fsCredit: number
  bonusDifferentialFs: number
  bonusCreditDate: string
  nextChargeDate: string
  generatedAt: string
}

function formatBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

function formatDatePtBR(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return iso
  }
}

interface PlanCTAButtonProps {
  planType: PlanType
  label: string
  /** Feature que motivou o upgrade prompt (ex: 'planos_page') */
  featureBlocked?: string
  /**
   * Plano atual resolvido server-side (fonte unica de verdade — task-006).
   * Quando fornecido, prevalece sobre o usePlanGuard (SWR) para o tier guard.
   */
  currentPlan?: CurrentPlan
  /**
   * Gateways habilitados resolvidos server-side (credenciais presentes).
   * Quando omitido (ex: PremiumFeatureCard), o hook useCheckoutGateways (SWR)
   * resolve client-side. A pagina /planos fornece para evitar flash + fetch extra.
   */
  enabledGateways?: CheckoutGateway[]
  defaultPeriod?: Period
  'data-testid'?: string
  className?: string
}

/**
 * CTA de upgrade que dispara o checkout DIRETO (sem modal intermediario). O
 * seletor de gateway foi removido porque a lista ja e filtrada server-side para
 * gateways com recorrencia real (na pratica um unico gateway ativo); o primeiro
 * da lista e a prioridade canonica de cobranca. O botao herda o label do card
 * (ex: "Assinar Craque"/"Assinar Lenda") e todos os estados (loading/erro/pendente)
 * ficam inline abaixo dele (Zero Silencio).
 */
export function PlanCTAButton({
  planType,
  label,
  featureBlocked = 'planos_page',
  currentPlan: currentPlanProp,
  enabledGateways: enabledGatewaysProp,
  defaultPeriod = 'MONTHLY',
  className,
  ...props
}: PlanCTAButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  // M066 (Fase 1a): painel de disclosure do upgrade pago->pago. null = fechado;
  // 'loading' = buscando preview; objeto = preview server-side exibido aguardando confirmação.
  const [preview, setPreview] = useState<UpgradePreview | 'loading' | null>(null)
  const inFlightRef = useRef(false)
  const { track } = useAnalytics()
  const { plan: guardPlan } = usePlanGuard()
  // Prop server-side prevalece; SWR e fallback para usos sem prop (ex: PremiumFeatureCard).
  const currentPlan = currentPlanProp ?? guardPlan

  // Gateways habilitados: prop server-side prevalece; hook (SWR) e o fallback
  // para consumidores client-only. Hook chamado incondicionalmente (rules of hooks).
  const { gateways: hookGateways, isLoading: gatewaysLoading } = useCheckoutGateways()
  const usingProp = enabledGatewaysProp !== undefined
  const enabledGateways = usingProp ? enabledGatewaysProp! : hookGateways
  const gatewaysResolving = !usingProp && gatewaysLoading
  const noGatewayAvailable = !gatewaysResolving && enabledGateways.length === 0

  // EVT-019 + checkout: o antigo botao de confirmacao do modal agora e o proprio
  // botao do card. Faz o tier guard, resolve o gateway e chama o checkout.
  // M066: quando o usuário JÁ tem plano pago (upgrade pago->pago), o primeiro clique abre o
  // painel de DISCLOSURE (3 linhas canônicas: o que ganha / quanto paga hoje / destino do
  // saldo + próxima cobrança — CDC 6º III/31) e o checkout só dispara na confirmação, que
  // envia o snapshot exibido como upgradeConsent (prova documental). Assinatura nova
  // (JOGADOR->pago) segue direta como antes: não há saldo antigo a divulgar.
  async function handleUpgradeClick() {
    if (inFlightRef.current) return

    // Validar que é upgrade e não lateral/downgrade (N-05).
    const currentTierOrder = TIER_ORDER[currentPlan] ?? -1
    const selectedTierOrder = TIER_ORDER[planType] ?? -1
    if (selectedTierOrder <= currentTierOrder) {
      setPending(null)
      setError(ALREADY_HAS_PLAN_MESSAGE)
      return
    }

    // Gateway: sem seletor — primeiro habilitado (prioridade canonica de cobranca).
    const gateway = enabledGateways[0]
    if (!gateway) {
      setPending(null)
      setError(NO_GATEWAY_MESSAGE)
      return
    }

    // Upgrade pago->pago sem disclosure exibida ainda: buscar preview e mostrar o painel.
    const isPaidToPaid = currentPlan === 'CRAQUE' || currentPlan === 'LENDA'
    if (isPaidToPaid && (preview === null || preview === 'loading')) {
      if (preview === 'loading') return
      setError(null)
      setPending(null)
      setPreview('loading')
      try {
        const res = await fetch(
          `/api/v1/payments/upgrade-preview?plan=${planType}&period=${defaultPeriod}`,
          { credentials: 'include' }
        )
        const json = await res.json()
        if (!res.ok || !json?.data) {
          setPreview(null)
          setError(resolveBlockMessage(json?.error?.code, json?.error?.message))
          return
        }
        setPreview(json.data as UpgradePreview)
        track('upgrade_view', {
          plan_selected: planType,
          current_plan: currentPlan,
          compensation: (json.data as UpgradePreview).compensation,
        })
      } catch {
        setPreview(null)
        setError('Erro ao carregar os detalhes do upgrade. Tente novamente.')
      }
      return
    }

    inFlightRef.current = true
    setLoading(true)
    setError(null)
    setPending(null)

    // Abrir a aba do gateway de forma sincrona no gesto do usuario (antes de
    // qualquer await) para nao ser bloqueada por popup blocker. opener anulado
    // imediatamente por seguranca.
    const checkoutWindow = window.open('', '_blank')
    if (checkoutWindow) checkoutWindow.opener = null

    // EVT-019 + EVT-020: click de upgrade e selecao do plano.
    track('plan_upgrade_clicked', {
      origin: featureBlocked,
      current_plan: currentPlan,
    })
    track('plan_selected', {
      plan_selected: planType,
      billing_cycle: 'monthly',
      current_plan: currentPlan,
    })

    // M066: confirmação pós-disclosure — snapshot exibido vira consent (recomputado no server).
    const consent =
      typeof preview === 'object' && preview !== null
        ? { shownAt: preview.generatedAt, snapshot: preview as unknown as Record<string, unknown> }
        : undefined
    if (consent) {
      track('upgrade_confirm', {
        plan_selected: planType,
        current_plan: currentPlan,
        compensation: (preview as UpgradePreview).compensation,
      })
    }

    try {
      const res = await fetch('/api/v1/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType,
          gateway,
          period: defaultPeriod,
          ...(consent ? { upgradeConsent: consent } : {}),
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        checkoutWindow?.close()
        setError(resolveBlockMessage(json?.error?.code, json?.error?.message))
        return
      }

      const redirectUrl: unknown = json?.data?.redirectUrl
      if (typeof redirectUrl !== 'string' || redirectUrl.length === 0) {
        checkoutWindow?.close()
        setError('URL de pagamento não recebida. Tente novamente.')
        return
      }

      // C1: short-circuit de pagamento pendente — servidor retorna redirect para
      // /planos?payment=pending (sem chamada ao gateway). Tratar como AVISO
      // distinto, nunca abrir a aba (que so mostraria a propria pagina /planos).
      let isPending = false
      try {
        isPending = new URL(redirectUrl, window.location.origin).searchParams.get('payment') === 'pending'
      } catch {
        isPending = false
      }
      if (isPending) {
        checkoutWindow?.close()
        setPending(PENDING_PAYMENT_MESSAGE)
        return
      }

      if (checkoutWindow && !checkoutWindow.closed) {
        checkoutWindow.location.href = redirectUrl
      } else {
        // Popup bloqueado ou fechado pelo usuario: fallback na mesma aba.
        window.location.href = redirectUrl
      }
    } catch {
      checkoutWindow?.close()
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }

  const previewData = typeof preview === 'object' && preview !== null ? preview : null
  const previewLoading = preview === 'loading'

  function handleCancelDisclosure() {
    track('upgrade_abandon', { plan_selected: planType, current_plan: currentPlan })
    setPreview(null)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* M066 — painel de disclosure do upgrade (3 linhas canônicas + próxima cobrança).
          Renderizado ANTES da confirmação; o snapshot exibido segue no checkout como consent. */}
      {previewData && (
        <div
          data-testid="upgrade-disclosure-panel"
          className="rounded-lg border border-[rgba(240,185,11,.3)] bg-[rgba(240,185,11,.06)] p-3 text-left text-xs text-[#C0C4CE] flex flex-col gap-1.5"
        >
          <p>
            <span className="font-semibold text-[#EAECEF]">Você ganha agora:</span>{' '}
            recursos do plano {previewData.targetPlan === 'LENDA' ? 'Lenda' : 'Craque'} + FS${' '}
            {previewData.bonusDifferentialFs.toLocaleString('pt-BR')} de bônus em{' '}
            {formatDatePtBR(previewData.bonusCreditDate)}.
          </p>
          <p>
            <span className="font-semibold text-[#EAECEF]">Você paga hoje:</span>{' '}
            {formatBRL(previewData.amountDueTodayCents)}.
          </p>
          <p data-testid="upgrade-disclosure-compensation">
            <span className="font-semibold text-[#EAECEF]">Dias não usados do plano atual:</span>{' '}
            {previewData.compensation === 'PARTIAL_REFUND' &&
              `serão estornados (${formatBRL(previewData.residualCents)}) no seu meio de pagamento em até 7 dias úteis.`}
            {previewData.compensation === 'FS_CREDIT' &&
              `viram FS$ ${previewData.fsCredit.toLocaleString('pt-BR')} de bônus promocional de migração, creditados na ativação do novo plano.`}
            {previewData.compensation === 'NONE' && 'não há saldo de dias a compensar.'}
          </p>
          <p className="text-[#929AA5]">
            Próxima cobrança: {formatBRL(previewData.amountDueTodayCents)} em{' '}
            {formatDatePtBR(previewData.nextChargeDate)}. Cancele quando quiser.
          </p>
        </div>
      )}

      <Button
        type="button"
        variant="plan"
        size="md"
        fullWidth
        onClick={handleUpgradeClick}
        disabled={loading || previewLoading || gatewaysResolving || noGatewayAvailable}
        className={className}
        {...props}
      >
        {loading
          ? 'Abrindo pagamento...'
          : previewLoading
            ? 'Carregando detalhes...'
            : previewData
              ? 'Confirmar upgrade'
              : label}
      </Button>

      {previewData && !loading && (
        <button
          type="button"
          data-testid="upgrade-disclosure-cancel"
          onClick={handleCancelDisclosure}
          className="text-xs text-[#929AA5] hover:text-[#C0C4CE] underline underline-offset-2"
        >
          Cancelar
        </button>
      )}

      {noGatewayAvailable && (
        <p
          data-testid="plan-cta-no-gateway"
          role="alert"
          className="text-xs text-[#F6465D] text-center"
        >
          {NO_GATEWAY_MESSAGE}
        </p>
      )}

      {error && (
        <div
          data-testid="plan-cta-block-reason"
          role="alert"
          className="text-sm text-red-400 bg-red-900/20 p-2 rounded border border-red-700/50"
        >
          {error}
        </div>
      )}

      {pending && (
        <p
          data-testid="plan-cta-pending-notice"
          role="status"
          className="text-xs text-[#F0B90B] text-center"
        >
          {pending}
        </p>
      )}
    </div>
  )
}
