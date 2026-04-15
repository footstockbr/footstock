// ============================================================================
// Foot Stock Motor — SessionConfig
// Configuração estática de sessões do mercado B3 (horários BRT + volatilidades).
// Referência: B3 Bovespa — Horários de Negociação (segmento Bovespa).
// ============================================================================

import type { SessionType, SessionWindow } from '../types/motor.types'

export type { SessionType, SessionWindow }

/**
 * Calendário de sessões de mercado em horário de Brasília (America/Sao_Paulo).
 * Ordem cronológica. FECHADO é o fallback para horários fora dos demais intervalos.
 */
export const SESSION_SCHEDULE: SessionWindow[] = [
  {
    type: 'PRE_OPENING',
    startHour: 10,
    startMinute: 45,
    endHour: 11,
    endMinute: 0,
    volatilityMultiplier: 0.30,
  },
  {
    type: 'TRADING',
    startHour: 11,
    startMinute: 0,
    endHour: 0,
    endMinute: 45,
    volatilityMultiplier: 1.00,
  },
  {
    type: 'CLOSING_CALL',
    startHour: 0,
    startMinute: 45,
    endHour: 1,
    endMinute: 0,
    volatilityMultiplier: 0.20,
  },
  {
    type: 'AFTER_MARKET',
    startHour: 1,
    startMinute: 0,
    endHour: 1,
    endMinute: 30,
    volatilityMultiplier: 0.10,
  },
  // CLOSED: 01:30–10:45 BRT (demais horários) — tratado como default no SessionManager
]

/**
 * Sessão default quando nenhuma janela se aplica (noite / madrugada).
 */
export const CLOSED_SESSION: SessionWindow = {
  type: 'CLOSED',
  startHour: 1,
  startMinute: 30,
  endHour: 10,
  endMinute: 45,
  volatilityMultiplier: 0.00,
}

export const SESSION_CONFIG_VERSION = '1.0.0'

/**
 * Volatilidade base diária (2%).
 * Usada como base de cálculo antes de aplicar o volatilityMultiplier da sessão.
 */
export const DEFAULT_VOLATILITY_BASE = 0.02

/**
 * Helper — retorna a cor hex da sessão (alinhado com SESSION_COLORS do Next.js).
 */
export function getSessionColor(session: SessionType): string {
  const colors: Record<SessionType, string> = {
    PRE_OPENING: '#F97316',
    TRADING: '#EAB308',
    CLOSING_CALL: '#06B6D4',
    AFTER_MARKET: '#7C3AED',
    CLOSED: '#EF4444',
  }
  return colors[session] ?? '#6b7280'
}
