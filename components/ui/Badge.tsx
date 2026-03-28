import { cn } from '@/lib/utils/cn'
import type { PlanType, Sentiment, SessionType } from '@/lib/enums'

export type BadgeVariant = 'default' | 'plan' | 'sentiment' | 'session' | 'success' | 'error' | 'warning'

export interface BadgeProps {
  children: React.ReactNode
  /** Variante visual do badge */
  variant?: BadgeVariant
  /** Para variant="plan" */
  plan?: PlanType
  /** Para variant="sentiment" */
  sentiment?: Sentiment
  /** Para variant="session" */
  session?: SessionType
  className?: string
}

const planStyles: Record<PlanType, string> = {
  JOGADOR: 'bg-plan-jogador/20 text-plan-jogador border-plan-jogador/30',
  CRAQUE: 'bg-plan-craque/20 text-plan-craque border-plan-craque/30',
  LENDA: 'bg-plan-lenda/20 text-plan-lenda border-plan-lenda/30',
}

const sentimentStyles: Record<Sentiment, string> = {
  MUITO_POSITIVO: 'bg-success/20 text-success border-success/30',
  POSITIVO: 'bg-success/10 text-success/80 border-success/20',
  NEUTRO: 'bg-bg-elevated text-text-secondary border-border-default',
  NEGATIVO: 'bg-error/10 text-error/80 border-error/20',
  MUITO_NEGATIVO: 'bg-error/20 text-error border-error/30',
}

const sessionStyles: Record<SessionType, string> = {
  PRE_ABERTURA: 'bg-session-pre-abertura/20 text-session-pre-abertura border-session-pre-abertura/30',
  NEGOCIACAO: 'bg-session-negociacao/20 text-session-negociacao border-session-negociacao/30',
  CALL: 'bg-session-call/20 text-session-call border-session-call/30',
  AFTER_MARKET: 'bg-session-after-market/20 text-session-after-market border-session-after-market/30',
  FECHADO: 'bg-session-fechado/20 text-session-fechado border-session-fechado/30',
}

/** Badge para indicadores visuais — plano, sentiment, sessao, status */
export function Badge({
  variant = 'default',
  plan,
  sentiment,
  session,
  children,
  className,
}: BadgeProps) {
  const dynamicStyle =
    variant === 'plan' && plan
      ? planStyles[plan]
      : variant === 'sentiment' && sentiment
        ? sentimentStyles[sentiment]
        : variant === 'session' && session
          ? sessionStyles[session]
          : null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5',
        'text-xs font-medium rounded-full border',
        'whitespace-nowrap',
        variant === 'default' && 'bg-bg-elevated text-text-secondary border-border-default',
        variant === 'success' && 'bg-success/20 text-success border-success/30',
        variant === 'error' && 'bg-error/20 text-error border-error/30',
        variant === 'warning' && 'bg-warning/20 text-warning border-warning/30',
        dynamicStyle,
        className
      )}
    >
      {children}
    </span>
  )
}
