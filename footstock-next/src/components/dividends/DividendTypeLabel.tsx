'use client'

import { Trophy, TrendingUp, Zap } from 'lucide-react'

export type DividendTypeValue =
  | 'ESPORTIVO'
  | 'FINANCEIRO'
  | 'SPORTING_RESULT'
  | 'FINANCIAL_PERIODIC'
  | 'YIELD_DIFFERENTIAL'

interface Props {
  type: DividendTypeValue
  size?: 'sm' | 'xs'
}

const TYPE_CONFIG: Record<
  DividendTypeValue,
  { label: string; icon: React.ElementType; bg: string; text: string; border: string }
> = {
  ESPORTIVO: {
    label: 'Resultado Esportivo',
    icon: Trophy,
    bg: 'rgba(240,185,11,.12)',
    text: '#F0B90B',
    border: 'rgba(240,185,11,.25)',
  },
  SPORTING_RESULT: {
    label: 'Resultado Esportivo',
    icon: Trophy,
    bg: 'rgba(240,185,11,.12)',
    text: '#F0B90B',
    border: 'rgba(240,185,11,.25)',
  },
  FINANCEIRO: {
    label: 'Financeiro Periódico',
    icon: TrendingUp,
    bg: 'rgba(46,189,133,.12)',
    text: '#2EBD85',
    border: 'rgba(46,189,133,.25)',
  },
  FINANCIAL_PERIODIC: {
    label: 'Financeiro Periódico',
    icon: TrendingUp,
    bg: 'rgba(46,189,133,.12)',
    text: '#2EBD85',
    border: 'rgba(46,189,133,.25)',
  },
  YIELD_DIFFERENTIAL: {
    label: 'Yield Diferencial',
    icon: Zap,
    bg: 'rgba(102,126,234,.12)',
    text: '#667EEA',
    border: 'rgba(102,126,234,.25)',
  },
}

export function DividendTypeLabel({ type, size = 'xs' }: Props) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.FINANCEIRO
  const Icon = config.icon
  const iconSize = size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'
  const textSize = size === 'xs' ? 'text-[10px]' : 'text-xs'

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium border ${textSize}`}
      style={{
        background: config.bg,
        color: config.text,
        borderColor: config.border,
      }}
    >
      <Icon className={iconSize} />
      {config.label}
    </span>
  )
}
