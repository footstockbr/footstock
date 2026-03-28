import type { PlanType } from '@/lib/enums'

export interface PlanIconProps {
  /** Tipo de plano do usuario */
  plan: PlanType
  /** Tamanho do icone em px */
  size?: number
  className?: string
}

const planColors: Record<PlanType, string> = {
  JOGADOR: 'var(--plan-jogador)',
  CRAQUE: 'var(--plan-craque)',
  LENDA: 'var(--plan-lenda)',
}

/** Icone SVG representando o plano do usuario */
export function PlanIcon({ plan, size = 20, className }: PlanIconProps) {
  const color = planColors[plan]

  if (plan === 'LENDA') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={color}
        className={className}
        aria-label="Plano Lenda"
      >
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    )
  }

  if (plan === 'CRAQUE') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={color}
        className={className}
        aria-label="Plano Craque"
      >
        <path d="M12 2L2 9l10 13L22 9z" />
      </svg>
    )
  }

  // JOGADOR — circulo
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      className={className}
      style={{ opacity: 0.7 }}
      aria-label="Plano Jogador"
    >
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}
