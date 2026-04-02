// ============================================================================
// Foot Stock — Timings, sessões e calendário de pregão
// ============================================================================

import type { SessionType } from '../enums';

/** Debounce padrão para inputs de busca (ms) */
export const DEBOUNCE_MS = 300;

/** Intervalo do tick do motor de cotações (ms) */
export const MOTOR_TICK_MS = 2_000;

/** Delay para reset do estado "copiado" em botões de clipboard (ms) */
export const COPY_FEEDBACK_MS = 2_000;

/** Delay após confirmação de pagamento PIX antes de avançar (ms) */
export const PIX_SUCCESS_DELAY_MS = 1_500;

/** Intervalo de polling rápido para admin/motor e AppHeader (ms) */
export const ADMIN_POLL_FAST_MS = 15_000;

/** Intervalo de polling lento para dashboards admin (ms) */
export const ADMIN_POLL_SLOW_MS = 5 * 60_000;

/** Cooldown de botão de refresh no painel de status do sistema (ms) */
export const SYSTEM_COOLDOWN_MS = 5_000;

/** Delay de redirect após ação concluída (ms) */
export const REDIRECT_DELAY_MS = 1_000;

/** Duração padrão de toasts/notificações visuais (ms) */
export const TOAST_DURATION_MS = 3_000;

/** Timeout padrão de chamadas à API (ms) */
export const API_TIMEOUT_MS = 10_000;

/** Intervalo de polling de notificações (ms) */
export const NOTIFICATION_POLL_MS = 30_000;

/** Cores associadas a cada sessão de pregão (Tailwind-compatible hex) */
export const SESSION_COLORS: Record<SessionType, string> = {
  PRE_ABERTURA: '#F0B90B',
  NEGOCIACAO: '#F0B90B',
  CALL: '#F0B90B',
  AFTER_MARKET: '#707A8A',
  FECHADO: '#F6465D',
} as const;

/**
 * Horários de cada sessão em formato HH:mm (horário de Brasília).
 * `start` = início, `end` = fim (exclusivo).
 */
export const SESSION_HOURS: Record<SessionType, { start: string; end: string }> = {
  PRE_ABERTURA: { start: '10:45', end: '11:00' },
  NEGOCIACAO:   { start: '11:00', end: '17:30' },
  CALL:         { start: '17:30', end: '17:45' },
  AFTER_MARKET: { start: '17:45', end: '01:30' }, // cruza meia-noite
  FECHADO:      { start: '01:30', end: '10:45' },
} as const;

/**
 * Dias da semana em que o pregão funciona (0 = domingo, 6 = sábado).
 * Segunda a sexta.
 */
export const TRADING_DAYS = [1, 2, 3, 4, 5] as const;
