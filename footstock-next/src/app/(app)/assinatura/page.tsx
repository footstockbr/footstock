import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Crown, Zap, Star, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import Link from 'next/link'
import { getAuthUser } from '@/lib/auth'
import { subscriptionService } from '@/lib/services/SubscriptionService'
import { ROUTES } from '@/lib/constants/routes'
import { CancelSubscriptionButton } from '@/components/payments/CancelSubscriptionButton'

export const metadata: Metadata = {
  title: 'Minha Assinatura — Foot Stock',
}

const PLAN_ICONS = { JOGADOR: Star, CRAQUE: Zap, LENDA: Crown }
const PLAN_NAMES = { JOGADOR: 'Jogador', CRAQUE: 'Craque', LENDA: 'Lenda' }
const GATEWAY_LABELS: Record<string, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  PAGSEGURO: 'PagSeguro',
  PAYPAL: 'PayPal',
}
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativo', color: 'text-[#2EBD85]' },
  TRIAL: { label: 'Trial', color: 'text-[#F0B90B]' },
  CANCELLATION_LOCK: { label: 'Cancelamento em andamento', color: 'text-[#F0B90B]' },
  PAST_DUE: { label: 'Pagamento pendente', color: 'text-[#F6465D]' },
  CANCELLED: { label: 'Cancelado', color: 'text-[#929AA5]' },
  EXPIRED: { label: 'Expirado', color: 'text-[#929AA5]' },
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function formatCurrency(centavos: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(centavos / 100)
}

export default async function AssinaturaPage() {
  const auth = await getAuthUser()
  if (!auth) redirect(ROUTES.LOGIN)

  const subscription = await subscriptionService.getCurrentSubscription(auth.user.id)

  if (!subscription) {
    return (
      <div data-testid="assinatura-page" className="px-4 pt-4 pb-8">
        <h1 className="text-xl font-bold text-[#EAECEF] mb-1">Minha Assinatura</h1>
        <p className="text-sm text-[#929AA5] mb-6">Você está no plano gratuito.</p>

        <div className="bg-[#1E2329] border border-[rgba(240,185,11,.12)] rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[rgba(120,110,90,.15)] flex items-center justify-center">
              <Star className="h-5 w-5 text-[#929AA5]" />
            </div>
            <div>
              <p className="font-bold text-[#EAECEF]">Jogador</p>
              <p className="text-xs text-[#929AA5]">Plano gratuito</p>
            </div>
          </div>
          <Link
            href={ROUTES.PLANOS}
            className="block w-full text-center py-2.5 rounded-lg bg-[#F0B90B] text-[#1E2329] font-bold text-sm"
            data-testid="upgrade-link"
          >
            Fazer upgrade
          </Link>
        </div>
      </div>
    )
  }

  const Icon = PLAN_ICONS[subscription.planType] ?? Star
  const planName = PLAN_NAMES[subscription.planType] ?? subscription.planType
  const statusInfo = STATUS_LABELS[subscription.status] ?? { label: subscription.status, color: 'text-[#929AA5]' }
  const canCancel = subscription.status === 'ACTIVE' || subscription.status === 'TRIAL'

  return (
    <div data-testid="assinatura-page" className="px-4 pt-4 pb-8 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-[#EAECEF] mb-1">Minha Assinatura</h1>
        <p className="text-sm text-[#929AA5]">Gerencie seu plano e pagamentos.</p>
      </div>

      {/* Card principal */}
      <div className="bg-[#1E2329] border border-[rgba(240,185,11,.2)] rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[rgba(240,185,11,.15)] flex items-center justify-center">
              <Icon className="h-5 w-5 text-[#F0B90B]" />
            </div>
            <div>
              <p className="font-bold text-[#EAECEF]">{planName}</p>
              <p className={`text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold font-mono text-[#EAECEF]">
              {formatCurrency(subscription.amount)}
            </p>
            <p className="text-xs text-[#929AA5]">
              /{subscription.period === 'MONTHLY' ? 'mês' : 'ano'}
            </p>
          </div>
        </div>

        <div className="border-t border-[rgba(240,185,11,.1)] pt-3 flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#929AA5]">Início</span>
            <span className="text-[#EAECEF]">{formatDate(subscription.startsAt)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#929AA5]">Próxima cobrança</span>
            <span className="text-[#EAECEF]">{formatDate(subscription.expiresAt)}</span>
          </div>
          {subscription.gateway && (
            <div className="flex justify-between text-sm">
              <span className="text-[#929AA5]">Método</span>
              <span className="text-[#EAECEF]">{GATEWAY_LABELS[subscription.gateway] ?? subscription.gateway}</span>
            </div>
          )}
          {subscription.daysUntilExpiry <= 7 && subscription.daysUntilExpiry > 0 && (
            <div className="flex items-center gap-2 text-xs text-[#F0B90B] mt-1">
              <Clock className="h-3.5 w-3.5" />
              <span>Renova em {subscription.daysUntilExpiry} dia{subscription.daysUntilExpiry !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bônus agendado */}
      {subscription.bonusCredit && !subscription.bonusCredit.credited && (
        <div className="bg-[rgba(46,189,133,.06)] border border-[rgba(46,189,133,.2)] rounded-xl p-4 flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 text-[#2EBD85] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-[#2EBD85]">Bônus em processamento</p>
            <p className="text-xs text-[#929AA5] mt-0.5">
              {formatCurrency(subscription.bonusCredit.amount)} em FS$ serão creditados após o período de arrependimento.
            </p>
          </div>
        </div>
      )}

      {/* Aviso de arrependimento */}
      {subscription.isEligibleForRefund && canCancel && (
        <div className="bg-[rgba(240,185,11,.06)] border border-[rgba(240,185,11,.2)] rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-[#F0B90B] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-[#F0B90B]">Período de arrependimento ativo</p>
            <p className="text-xs text-[#929AA5] mt-0.5">
              Você tem direito ao cancelamento com reembolso integral até 7 dias após a contratação (CDC Art. 49).
            </p>
          </div>
        </div>
      )}

      {/* Cancelamento bloqueado */}
      {subscription.cancellationLock && (
        <div className="bg-[rgba(246,70,93,.06)] border border-[rgba(246,70,93,.2)] rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-[#F6465D] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-[#F6465D]">Cancelamento em processamento</p>
            <p className="text-xs text-[#929AA5] mt-0.5">
              Seu acesso permanece ativo por mais {subscription.cancellationLock.hoursRemaining}h.
            </p>
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-col gap-3">
        <Link
          href={ROUTES.PLANOS}
          className="block w-full text-center py-2.5 rounded-lg border border-[rgba(240,185,11,.3)] text-[#F0B90B] font-medium text-sm"
          data-testid="change-plan-link"
        >
          Ver outros planos
        </Link>

        {canCancel && (
          <CancelSubscriptionButton
            isEligibleForRefund={subscription.isEligibleForRefund}
          />
        )}
      </div>

      <p className="text-xs text-center text-[#707A8A]">
        Dúvidas?{' '}
        <a href="mailto:suporte@footstock.com.br" className="underline">
          Entre em contato
        </a>
      </p>
    </div>
  )
}
