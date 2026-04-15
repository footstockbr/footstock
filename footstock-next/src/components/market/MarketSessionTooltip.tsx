'use client'

import { MarketSession, SESSION_SCHEDULE_BRT } from '@/lib/constants/market'

const TOOLTIP_MESSAGES: Record<MarketSession, string> = {
  [MarketSession.PRE_OPENING]:
    'Mercado em pré-abertura. Volatilidade reduzida (30%). Abertura às 11:00.',
  [MarketSession.TRADING]:
    'Mercado em negociação. Volatilidade plena. Fechamento às 00:45.',
  [MarketSession.CLOSING_CALL]:
    'Call de fechamento. Volatilidade reduzida (20%). Encerra às 01:00.',
  [MarketSession.AFTER_MARKET]:
    'After-market. Volatilidade mínima (10%). Encerra às 01:30.',
  [MarketSession.CLOSED]:
    'Mercado fechado. Ordens serão processadas na abertura (10:45).',
}

interface MarketSessionTooltipProps {
  session: MarketSession
  className?: string
}

export function MarketSessionTooltip({ session, className }: MarketSessionTooltipProps) {
  const message = TOOLTIP_MESSAGES[session]
  const schedule = SESSION_SCHEDULE_BRT[session]

  return (
    <div
      className={className}
      role="tooltip"
    >
      <p className="text-xs text-[#EAECEF] font-medium">{message}</p>
      <p className="text-[10px] text-[#929AA5] mt-1">
        Horário: {schedule.start} — {schedule.end} BRT
      </p>
    </div>
  )
}

export { TOOLTIP_MESSAGES }
