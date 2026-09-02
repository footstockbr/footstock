'use client'

import { MarketSession, SESSION_SCHEDULE_BRT } from '@/lib/constants/market'

// Cada texto descreve o que o sistema FAZ na sessao, nao o que seria desejavel.
// O texto de CLOSED dizia "Ordens serão processadas na abertura (10:45)" e as
// duas metades estavam erradas: 10:45 e a pre-abertura, nao a abertura (11:00,
// SESSION_SCHEDULE_BRT), e nada e processado na abertura — fora do pregao a API
// RECUSA ordem a mercado com SESS_040 (OrderService._checkMarketSession), nao
// enfileira. O cliente lia uma promessa de fila que nao existe e concluia que o
// sistema tinha engolido a ordem.
//
// PENDENCIA DE PRODUTO: existe o tipo SCHEDULED para agendar execucao, mas nao
// ha enfileiramento automatico de MARKET enviada com o mercado fechado. Se a
// intencao do produto for enfileirar, o trabalho e no backend; ate la a copy
// abaixo diz a verdade e aponta a saida que de fato existe.
const TOOLTIP_MESSAGES: Record<MarketSession, string> = {
  [MarketSession.PRE_OPENING]:
    'Pré-abertura. Volatilidade reduzida (30%). Ordens a mercado só a partir das 11:00.',
  [MarketSession.TRADING]:
    'Mercado em negociação. Volatilidade plena. Fechamento às 00:45.',
  [MarketSession.CLOSING_CALL]:
    'Call de fechamento. Volatilidade reduzida (20%). Encerra às 01:00.',
  [MarketSession.AFTER_MARKET]:
    'After-market. Volatilidade mínima (10%). Encerra às 01:30. Ordens a mercado não são aceitas.',
  [MarketSession.CLOSED]:
    'Mercado fechado. Ordens a mercado não são aceitas agora; o pregão abre às 11:00. Para deixar programado, use uma ordem agendada.',
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
