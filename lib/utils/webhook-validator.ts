// ============================================================================
// Foot Stock — webhook-validator: validação HMAC-SHA256 com timing-safe
// Previne PAYMENT_051 (HMAC inválido) e replay attacks
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto'

const REPLAY_WINDOW_MS = 5 * 60 * 1000 // 5 minutos

/**
 * Valida assinatura HMAC-SHA256 do webhook usando timingSafeEqual.
 * Timing-safe: sem timing attacks — mesmo tempo para HMAC válido e inválido.
 */
export function validateWebhookHMAC(
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(signature, 'utf8')

  // Tamanhos diferentes → curto-circuito (timing-safe: sem short-circuit attack)
  if (expectedBuf.length !== receivedBuf.length) return false

  return timingSafeEqual(expectedBuf, receivedBuf)
}

/**
 * Verifica replay attack: rejeita payloads com timestamp > 5 minutos no passado.
 * @returns true se payload é recente (válido), false se replay
 */
export function validateWebhookTimestamp(payloadTimestamp: number): boolean {
  const now = Date.now()
  const diff = Math.abs(now - payloadTimestamp)
  return diff <= REPLAY_WINDOW_MS
}

/**
 * Cria hash SHA-256 do payload para logging sem expor dados sensíveis.
 */
export function hashPayloadForLog(payload: Buffer | string): string {
  const buf = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload
  return createHmac('sha256', 'log-salt').update(buf).digest('hex').substring(0, 16)
}
