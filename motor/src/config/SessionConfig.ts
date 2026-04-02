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
    type: 'PRE_ABERTURA',
    startHour: 10,
    startMinute: 45,
    endHour: 11,
    endMinute: 0,
    volatilityMultiplier: 0.30,
  },
  {
    type: 'NEGOCIACAO',
    startHour: 11,
    startMinute: 0,
    endHour: 0,
    endMinute: 45,
    volatilityMultiplier: 1.00,
  },
  {
    type: 'CALL',
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
  // FECHADO: 01:30–10:45 BRT (demais horários) — tratado como default no SessionManager
]

/**
 * Sessão default quando nenhuma janela se aplica (noite / madrugada).
 */
export const CLOSED_SESSION: SessionWindow = {
  type: 'FECHADO',
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
    PRE_ABERTURA: '#f5a623',
    NEGOCIACAO: '#6c63ff',
    CALL: '#38bdf8',
    AFTER_MARKET: '#8b5cf6',
    FECHADO: '#f43f5e',
  }
  return colors[session] ?? '#6b7280'
}
