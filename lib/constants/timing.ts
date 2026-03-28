// ============================================================================
// Foot Stock — Timings, sessões e calendário de pregão
// ============================================================================

import type { SessionType } from '../enums';

/** Debounce padrão para inputs de busca (ms) */
export const DEBOUNCE_MS = 300;

/** Intervalo do tick do motor de cotações (ms) */
export const MOTOR_TICK_MS = 2_000;

/** Duração padrão de toasts/notificações visuais (ms) */
export const TOAST_DURATION_MS = 3_000;

/** Timeout padrão de chamadas à API (ms) */
export const API_TIMEOUT_MS = 10_000;

/** Intervalo de polling de notificações (ms) */
export const NOTIFICATION_POLL_MS = 30_000;

/** Cores associadas a cada sessão de pregão (Tailwind-compatible hex) */
export const SESSION_COLORS: Record<SessionType, string> = {
  PRE_ABERTURA: '#f59e0b',
  NEGOCIACAO: '#8b5cf6',
  CALL: '#ef4444',
  AFTER_MARKET: '#6366f1',
  FECHADO: '#6b7280',
} as const;

/**
 * Horários de cada sessão em formato HH:mm (horário de Brasília).
 * `start` = início, `end` = fim (exclusivo).
 */
export const SESSION_HOURS: Record<SessionType, { start: string; end: string }> = {
  PRE_ABERTURA: { start: '09:00', end: '10:00' },
  NEGOCIACAO: { start: '10:00', end: '17:00' },
  CALL: { start: '17:00', end: '17:30' },
  AFTER_MARKET: { start: '17:30', end: '18:00' },
  FECHADO: { start: '18:00', end: '09:00' },
} as const;

/**
 * Dias da semana em que o pregão funciona (0 = domingo, 6 = sábado).
 * Segunda a sexta.
 */
export const TRADING_DAYS = [1, 2, 3, 4, 5] as const;
