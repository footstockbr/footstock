// ============================================================================
// FootStock — Utilitários de fuso horário
// Centraliza cálculos relativos ao fuso America/Sao_Paulo (UTC-3, sem DST).
// Usado pelos limites diários de ordens e jobs de expiração.
// ============================================================================

const BRT_OFFSET_HOURS = 3 // UTC-3 fixo (Brasil não usa DST desde 2019)
const BRT_OFFSET_MS = BRT_OFFSET_HOURS * 60 * 60 * 1000

/**
 * Retorna a data atual no fuso BRT como string "YYYY-MM-DD".
 * Usado como parte da chave Redis `order:daily:{userId}:{date}`.
 */
export function todayInBRT(now: Date = new Date()): string {
  const brtMs = now.getTime() - BRT_OFFSET_MS
  return new Date(brtMs).toISOString().slice(0, 10)
}

/**
 * Retorna { startUtc, endUtc } representando os limites do dia BRT corrente
 * expressos como instâncias Date em UTC.
 *
 * Exemplo: se agora for 2026-04-14T02:00:00Z (22:00 BRT do dia 13),
 * retorna:
 *   startUtc = 2026-04-13T03:00:00Z  (meia-noite BRT do dia 13)
 *   endUtc   = 2026-04-14T02:59:59.999Z (23:59:59.999 BRT do dia 13)
 */
export function getBrtDayBounds(now: Date = new Date()): { startUtc: Date; endUtc: Date } {
  const dateStr = todayInBRT(now)
  // meia-noite BRT = 03:00 UTC
  const startUtc = new Date(`${dateStr}T00:00:00.000Z`)
  startUtc.setTime(startUtc.getTime() + BRT_OFFSET_MS)
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { startUtc, endUtc }
}

/**
 * Retorna a próxima meia-noite no fuso BRT como instância Date (UTC).
 */
export function nextMidnightBRT(now: Date = new Date()): Date {
  const { endUtc } = getBrtDayBounds(now)
  return new Date(endUtc.getTime() + 1) // 00:00:00.000 do próximo dia BRT
}

/**
 * Retorna o número de segundos inteiros até a próxima meia-noite BRT.
 * Mínimo de 1 segundo (nunca retorna 0 ou negativo).
 */
export function secondsUntilMidnightBRT(now: Date = new Date()): number {
  const midnight = nextMidnightBRT(now)
  return Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 1000))
}

/**
 * Formata a diferença de tempo em "Xh Ymin" legível para o usuário.
 * Usado em mensagens de erro como "Próximo reset em 3h42min".
 */
export function formatTimeUntilReset(now: Date = new Date()): string {
  const secs = secondsUntilMidnightBRT(now)
  const hours = Math.floor(secs / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  if (hours > 0) return `${hours}h${mins > 0 ? `${mins}min` : ''}`
  return `${mins}min`
}
