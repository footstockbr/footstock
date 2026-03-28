// ============================================================================
// Foot Stock — SessionManager (Next.js)
// Detecta sessão de mercado atual baseada no horário BRT via date-fns-tz.
// Espelha a lógica do motor Railway — ambos retornam o mesmo resultado
// pois a detecção é determinística (baseada em relógio BRT).
// ============================================================================

import { toZonedTime } from 'date-fns-tz'
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

const SESSION_SCHEDULE: SessionWindow[] = [
  { type: MarketSession.PRE_ABERTURA, startHour: 8, startMinute: 0, endHour: 9, endMinute: 30, volatilityMultiplier: 0.30 },
  { type: MarketSession.NEGOCIACAO, startHour: 9, startMinute: 30, endHour: 17, endMinute: 0, volatilityMultiplier: 1.00 },
  { type: MarketSession.CALL, startHour: 17, startMinute: 0, endHour: 17, endMinute: 30, volatilityMultiplier: 0.20 },
  { type: MarketSession.AFTER_MARKET, startHour: 17, startMinute: 30, endHour: 18, endMinute: 0, volatilityMultiplier: 0.10 },
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
    if (timeMinutes >= start && timeMinutes < end) return w.type
  }
  return MarketSession.FECHADO
}

function findNextWindow(hour: number, minute: number): SessionWindow {
  const timeMinutes = hour * 60 + minute
  for (const w of SESSION_SCHEDULE) {
    const start = w.startHour * 60 + w.startMinute
    if (start > timeMinutes) return w
  }
  return SESSION_SCHEDULE[0]!
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

  const transitionBrt = new Date(brt)
  transitionBrt.setHours(nextWindow.startHour, nextWindow.startMinute, 0, 0)
  if (transitionBrt.getTime() <= brt.getTime()) {
    transitionBrt.setDate(transitionBrt.getDate() + 1)
  }

  const countdownSeconds = Math.max(0, Math.floor((transitionBrt.getTime() - now.getTime()) / 1000))

  return {
    session: nextWindow.type,
    transitionAt: transitionBrt.toISOString(),
    countdownSeconds,
  }
}

export function isMarketOpen(now = new Date()): boolean {
  const s = getCurrentSession(now)
  return s === MarketSession.NEGOCIACAO || s === MarketSession.PRE_ABERTURA
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
