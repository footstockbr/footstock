// ============================================================================
// FootStock — SessionManager (Next.js)
// Detecta sessão de mercado atual baseada no horário BRT via date-fns-tz.
// Espelha a lógica do motor Railway — ambos retornam o mesmo resultado
// pois a detecção é determinística (baseada em relógio BRT).
// ============================================================================

import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import { MarketSession, SESSION_LABELS } from '@/lib/constants/market'

export const BRT_TIMEZONE = 'America/Sao_Paulo'

export interface SessionWindow {
  type: MarketSession
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  volatilityMultiplier: number
}

// Horários BRT (America/Sao_Paulo) — espelho do motor Railway
// TRADING cruza meia-noite: 11:00 → 00:45 (endHour usa 24+ para representar wrap)
const SESSION_SCHEDULE: SessionWindow[] = [
  { type: MarketSession.PRE_OPENING,  startHour: 10, startMinute: 45, endHour: 11,  endMinute: 0,  volatilityMultiplier: 0.30 },
  { type: MarketSession.TRADING,      startHour: 11, startMinute: 0,  endHour: 24,  endMinute: 45, volatilityMultiplier: 1.00 },
  { type: MarketSession.CLOSING_CALL, startHour: 0,  startMinute: 45, endHour: 1,   endMinute: 0,  volatilityMultiplier: 0.20 },
  { type: MarketSession.AFTER_MARKET, startHour: 1,  startMinute: 0,  endHour: 1,   endMinute: 30, volatilityMultiplier: 0.10 },
]

export interface NextTransition {
  session: MarketSession
  transitionAt: string  // ISO datetime
  countdownSeconds: number
}

function findSession(hour: number, minute: number): MarketSession {
  const timeMinutes = hour * 60 + minute
  for (const w of SESSION_SCHEDULE) {
    const start = w.startHour * 60 + w.startMinute
    const end = w.endHour * 60 + w.endMinute
    if (end > 24 * 60) {
      // Janela que cruza meia-noite: ativa se >= start OU < (end - 24h)
      const endWrapped = end - 24 * 60
      if (timeMinutes >= start || timeMinutes < endWrapped) return w.type
    } else {
      if (timeMinutes >= start && timeMinutes < end) return w.type
    }
  }
  return MarketSession.CLOSED
}

/**
 * Proxima janela a comecar, pela MENOR distancia positiva ate o inicio dela,
 * com rollover de 24h — espelho de SessionManager._findNextWindow do motor.
 *
 * A versao anterior varria SESSION_SCHEDULE na ordem do array e devolvia a
 * primeira janela com `start > agora`. Como o array nao esta ordenado por
 * relogio (CLOSING_CALL 00:45 e AFTER_MARKET 01:00 vem depois de TRADING
 * 11:00), nenhuma casava durante o pregao e o fallback devolvia PRE_OPENING:
 * as 17:41 o badge dizia "Fecha em 17h 03min" (contando ate a ABERTURA das
 * 10:45 do dia seguinte) em vez do fechamento real das 00:45.
 */
function findNextWindow(hour: number, minute: number): SessionWindow {
  const timeMinutes = hour * 60 + minute
  let best: SessionWindow | null = null
  let bestDiff = Number.POSITIVE_INFINITY

  for (const w of SESSION_SCHEDULE) {
    const start = w.startHour * 60 + w.startMinute
    let diff = (start - timeMinutes + 1440) % 1440
    if (diff === 0) diff = 1440 // ja estamos no inicio dela: proxima ocorrencia e amanha
    if (diff < bestDiff) {
      bestDiff = diff
      best = w
    }
  }

  return best ?? SESSION_SCHEDULE[0]!
}

export function getCurrentSession(now = new Date()): MarketSession {
  const brt = toZonedTime(now, BRT_TIMEZONE)
  return findSession(brt.getHours(), brt.getMinutes())
}

export function getVolatilityMultiplier(session?: MarketSession, now = new Date()): number {
  const s = session ?? getCurrentSession(now)
  const w = SESSION_SCHEDULE.find(x => x.type === s)
  return w?.volatilityMultiplier ?? 0.0
}

export function getNextTransition(now = new Date()): NextTransition {
  const brt = toZonedTime(now, BRT_TIMEZONE)
  const nextWindow = findNextWindow(brt.getHours(), brt.getMinutes())

  // Candidato montado no espaco de wall-clock BRT (o que toZonedTime devolve).
  const candidate = new Date(brt)
  candidate.setHours(nextWindow.startHour, nextWindow.startMinute, 0, 0)
  if (candidate.getTime() <= brt.getTime()) {
    candidate.setDate(candidate.getDate() + 1)
  }

  // Volta de wall-clock BRT para o instante UTC real. Sem fromZonedTime o
  // countdown e o transitionAt erravam pelo offset do fuso do PROCESSO — so
  // acertavam por acidente quando o container ja rodava em America/Sao_Paulo.
  const transitionAt = fromZonedTime(candidate, BRT_TIMEZONE)
  const countdownSeconds = Math.max(0, Math.floor((transitionAt.getTime() - now.getTime()) / 1000))

  return {
    session: nextWindow.type,
    transitionAt: transitionAt.toISOString(),
    countdownSeconds,
  }
}

export function isMarketOpen(now = new Date()): boolean {
  const s = getCurrentSession(now)
  return s === MarketSession.TRADING || s === MarketSession.PRE_OPENING || s === MarketSession.CLOSING_CALL
}

export function getSessionLabel(session: MarketSession): string {
  return SESSION_LABELS[session] ?? 'Desconhecido'
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0min'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  return `${m}min`
}
