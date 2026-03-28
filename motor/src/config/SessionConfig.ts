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
    startHour: 8,
    startMinute: 0,
    endHour: 9,
    endMinute: 30,
    volatilityMultiplier: 0.30,
  },
  {
    type: 'NEGOCIACAO',
    startHour: 9,
    startMinute: 30,
    endHour: 17,
    endMinute: 0,
    volatilityMultiplier: 1.00,
  },
  {
    type: 'CALL',
    startHour: 17,
    startMinute: 0,
    endHour: 17,
    endMinute: 30,
    volatilityMultiplier: 0.20,
  },
  {
    type: 'AFTER_MARKET',
    startHour: 17,
    startMinute: 30,
    endHour: 18,
    endMinute: 0,
    volatilityMultiplier: 0.10,
  },
  // FECHADO: 18:00–08:00 BRT (demais horários) — tratado como default no SessionManager
]

/**
 * Sessão default quando nenhuma janela se aplica (noite / madrugada).
 */
export const CLOSED_SESSION: SessionWindow = {
  type: 'FECHADO',
  startHour: 18,
  startMinute: 0,
  endHour: 8,
  endMinute: 0,
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
    PRE_ABERTURA: '#c9a84c',
    NEGOCIACAO: '#8b5cf6',
    CALL: '#06b6d4',
    AFTER_MARKET: '#7c3aed',
    FECHADO: '#ef4444',
  }
  return colors[session] ?? '#6b7280'
}
