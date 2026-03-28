// ============================================================================
// Foot Stock Motor — SessionManager
// Detecta sessão de mercado atual baseada no horário BRT via date-fns-tz.
// Servidor Railway opera em TZ=UTC — toda conversão é explícita.
// ============================================================================

import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { SESSION_SCHEDULE, CLOSED_SESSION } from '../config/SessionConfig'
import type { SessionType, SessionWindow } from '../types/motor.types'
import { logger } from '../utils/logger'

export const BRT_TIMEZONE = 'America/Sao_Paulo'

export interface NextTransition {
  session: SessionType
  transitionAt: Date
  countdownSeconds: number
}

/**
 * SessionManager — detecta sessão atual e calcula transições.
 * Aceita injeção de clock para facilitar testes.
 */
export class SessionManager {
  private readonly clock: () => Date

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock
  }

  /**
   * Retorna a sessão de mercado atual em horário de Brasília.
   * Usa date-fns-tz para conversão correta — inclui horário de verão (DST).
   */
  getCurrentSession(now?: Date): SessionType {
    try {
      const utcNow = now ?? this.clock()
      const brt = toZonedTime(utcNow, BRT_TIMEZONE)
      const hour = brt.getHours()
      const minute = brt.getMinutes()
      return this._findSession(hour, minute)
    } catch (err) {
      logger.error(JSON.stringify({
        level: 'error',
        code: 'SYS_001',
        message: 'Clock timezone invalid',
        error: String(err),
      }))
      throw err
    }
  }

  /**
   * Retorna o multiplicador de volatilidade da sessão atual ou da sessão passada.
   */
  getVolatilityMultiplier(session?: SessionType): number {
    const s = session ?? this.getCurrentSession()
    if (s === 'FECHADO') return 0.0
    const window = SESSION_SCHEDULE.find(w => w.type === s)
    if (!window) {
      logger.warn(JSON.stringify({ level: 'warn', code: 'VAL_001', session: s, message: 'SessionType desconhecido — retornando 0.0' }))
      return 0.0
    }
    return window.volatilityMultiplier
  }

  /**
   * Calcula a próxima transição de sessão e o countdown em segundos.
   */
  getNextTransition(now?: Date): NextTransition {
    const utcNow = now ?? this.clock()
    const brt = toZonedTime(utcNow, BRT_TIMEZONE)
    const currentHour = brt.getHours()
    const currentMinute = brt.getMinutes()
    const currentSession = this._findSession(currentHour, currentMinute)

    // Encontrar próxima janela de sessão na ordem cronológica
    const sorted = [...SESSION_SCHEDULE]
    const nextWindow = this._findNextWindow(currentHour, currentMinute)

    const transitionAt = this._buildTransitionDate(brt, nextWindow)
    const countdownSeconds = Math.max(0, Math.floor((transitionAt.getTime() - utcNow.getTime()) / 1000))

    return {
      session: nextWindow.type,
      transitionAt,
      countdownSeconds,
    }
  }

  /**
   * Retorna true se o mercado está aberto para negociação.
   * Considera PRE_ABERTURA e NEGOCIACAO como "aberto".
   */
  isMarketOpen(now?: Date): boolean {
    const session = this.getCurrentSession(now)
    return session === 'NEGOCIACAO' || session === 'PRE_ABERTURA'
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private _findSession(hour: number, minute: number): SessionType {
    const timeMinutes = hour * 60 + minute
    for (const window of SESSION_SCHEDULE) {
      const start = window.startHour * 60 + window.startMinute
      const end = window.endHour * 60 + window.endMinute
      if (timeMinutes >= start && timeMinutes < end) {
        return window.type
      }
    }
    return 'FECHADO'
  }

  private _findNextWindow(hour: number, minute: number): SessionWindow {
    const timeMinutes = hour * 60 + minute
    // Encontrar próxima janela que ainda não começou hoje
    for (const window of SESSION_SCHEDULE) {
      const start = window.startHour * 60 + window.startMinute
      if (start > timeMinutes) {
        return window
      }
    }
    // Além da última janela do dia → próximo dia, primeira sessão (PRE_ABERTURA)
    return SESSION_SCHEDULE[0]!
  }

  private _buildTransitionDate(brtNow: Date, window: SessionWindow): Date {
    // Construir data em "BRT wall-clock space" (resultado de toZonedTime)
    const candidate = new Date(brtNow)
    candidate.setHours(window.startHour, window.startMinute, 0, 0)

    // Se a transição já passou hoje, empurrar para amanhã
    if (candidate.getTime() <= brtNow.getTime()) {
      candidate.setDate(candidate.getDate() + 1)
    }

    // Converter de BRT wall-clock para UTC real usando fromZonedTime.
    // Sem isso, o countdown erraria pelo offset UTC (ex: 3h para BRT).
    return fromZonedTime(candidate, BRT_TIMEZONE)
  }
}

// Singleton compartilhado pelo motor Railway
export const sessionManager = new SessionManager()
