// ============================================================================
// Foot Stock — Validadores HMAC por gateway de pagamento
// PCI-DSS: usa timingSafeEqual para prevenir timing attacks
// Referência: PAYMENT_001 (HMAC inválido), PAYMENT_002 (timestamp expirado)
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto'
import { WEBHOOK_REPLAY_WINDOW_MS } from '@/lib/constants/payment-security'
import { GatewayType } from './IGateway'
import { env } from '@/lib/env'

// ─── Mercado Pago ─────────────────────────────────────────────────────────────

/**
 * Valida assinatura HMAC do Mercado Pago.
 * Header X-Signature formato: `ts=<timestamp>,v1=<hmac>`
 * String de validação: `id:<requestId>;ts:<ts>;`
 */
export function validateMercadoPagoHMAC(
  headers: Headers,
  rawBody: string,
  secret: string
): boolean {
  try {
    const xSignature  = headers.get('x-signature') ?? ''
    const xRequestId  = headers.get('x-request-id') ?? ''

    // Extrair ts e v1 do header
    const tsMatch = xSignature.match(/ts=(\d+)/)
    const v1Match = xSignature.match(/v1=([a-f0-9]+)/i)

    if (!tsMatch || !v1Match) return false

    const ts = tsMatch[1]
    const v1 = v1Match[1]
    if (!ts || !v1) return false

    // Verificar janela de replay (PAYMENT_002)
    if (!validateWebhookTimestamp(parseInt(ts, 10) * 1000)) return false

    // Construir string de validação
    const template = `id:${xRequestId};ts:${ts};`
    const expected  = createHmac('sha256', secret).update(template).digest('hex')

    // Comparação timing-safe (previne timing attacks)
    const expectedBuf = Buffer.from(expected, 'utf8')
    const receivedBuf = Buffer.from(v1, 'utf8')

    if (expectedBuf.length !== receivedBuf.length) {
      // Pad para manter tempo constante
      timingSafeEqual(expectedBuf, Buffer.alloc(expectedBuf.length))
      return false
    }

    return timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}

// ─── PagSeguro ───────────────────────────────────────────────────────────────

/**
 * Valida assinatura HMAC do PagSeguro.
 * Header: x-pagseguro-signature
 * String: rawBody completo
 */
export function validatePagSeguroHMAC(
  headers: Headers,
  rawBody: string,
  secret: string
): boolean {
  try {
    const signature = headers.get('x-pagseguro-signature') ?? ''
    if (!signature) return false

    const expected    = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
    const expectedBuf = Buffer.from(expected, 'utf8')
    const receivedBuf = Buffer.from(signature, 'utf8')

    if (expectedBuf.length !== receivedBuf.length) {
      timingSafeEqual(expectedBuf, Buffer.alloc(expectedBuf.length))
      return false
    }

    return timingSafeEqual(expectedBuf, receivedBuf)
  } catch {
    return false
  }
}

// ─── PayPal ──────────────────────────────────────────────────────────────────

/**
 * Valida webhook PayPal via PayPal Verify API.
 * PayPal usa verificação remota (não HMAC local).
 */
export async function validatePayPalWebhook(
  headers: Headers,
  rawBody: string,
  webhookId: string
): Promise<boolean> {
  try {
    const transmissionId   = headers.get('paypal-transmission-id') ?? ''
    const certUrl          = headers.get('paypal-cert-url') ?? ''
    const authAlgo         = headers.get('paypal-auth-algo') ?? ''
    const transmissionSig  = headers.get('paypal-transmission-sig') ?? ''
    const transmissionTime = headers.get('paypal-transmission-time') ?? ''

    if (!transmissionId || !certUrl || !authAlgo || !transmissionSig) return false

    const isSandbox = process.env.PAYPAL_SANDBOX !== 'false'
    const apiBase   = isSandbox
      ? 'https://api-m.sandbox.paypal.com'
      : 'https://api-m.paypal.com'

    // Obter access token
    const clientId     = env.PAYPAL_CLIENT_ID ?? ''
    const clientSecret = env.PAYPAL_CLIENT_SECRET ?? ''
    const credentials  = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const tokenRes = await fetch(`${apiBase}/v1/oauth2/token`, {
      method:  'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(5000),
    })

    if (!tokenRes.ok) return false
    const tokenData = await tokenRes.json() as { access_token: string }

    // Verificar assinatura via PayPal Verify API
    const verifyRes = await fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        webhook_id:        webhookId,
        transmission_id:   transmissionId,
        cert_url:          certUrl,
        auth_algo:         authAlgo,
        transmission_sig:  transmissionSig,
        transmission_time: transmissionTime,
        webhook_event:     JSON.parse(rawBody),
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (!verifyRes.ok) return false
    const verifyData = await verifyRes.json() as { verification_status: string }
    return verifyData.verification_status === 'SUCCESS'
  } catch {
    return false
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Valida HMAC pelo gateway detectado.
 * @throws Error se gateway não suportado
 */
export async function validateWebhookByGateway(
  headers:    Headers,
  rawBody:    string,
  gateway:    GatewayType
): Promise<boolean> {
  switch (gateway) {
    case GatewayType.MERCADO_PAGO: {
      const secret = env.MERCADO_PAGO_WEBHOOK_SECRET ?? ''
      return validateMercadoPagoHMAC(headers, rawBody, secret)
    }
    case GatewayType.PAGSEGURO: {
      const secret = env.PAGSEGURO_WEBHOOK_SECRET ?? ''
      return validatePagSeguroHMAC(headers, rawBody, secret)
    }
    case GatewayType.PAYPAL: {
      const webhookId = env.PAYPAL_WEBHOOK_ID ?? ''
      return validatePayPalWebhook(headers, rawBody, webhookId)
    }
    default: {
      const err = new Error(`Gateway não suportado para validação HMAC: ${gateway}`) as Error & { code: string }
      err.code = 'PAYMENT_052'
      throw err
    }
  }
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Verifica janela de replay attack.
 * @param timestampMs timestamp em milissegundos
 * @returns true se dentro da janela de 5 minutos
 */
export function validateWebhookTimestamp(timestampMs: number): boolean {
  const diff = Math.abs(Date.now() - timestampMs)
  return diff <= WEBHOOK_REPLAY_WINDOW_MS
}
