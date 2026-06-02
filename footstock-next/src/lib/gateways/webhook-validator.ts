// ============================================================================
// FootStock — Validadores HMAC por gateway de pagamento
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
 * String de validação: `id:<data.id do body>;ts:<ts>;`
 */
export function validateMercadoPagoHMAC(
  headers: Headers,
  rawBody: string,
  secret: string
): boolean {
  try {
    const xSignature  = headers.get('x-signature') ?? ''

    // Extrair ts e v1 do header
    const tsMatch = xSignature.match(/ts=(\d+)/)
    const v1Match = xSignature.match(/v1=([a-f0-9]+)/i)

    if (!tsMatch || !v1Match) return false

    const ts = tsMatch[1]
    const v1 = v1Match[1]
    if (!ts || !v1) return false

    // Verificar janela de replay (PAYMENT_002)
    if (!validateWebhookTimestamp(parseInt(ts, 10) * 1000)) return false

    // data.id do body — manifesto canônico MP: `id:{data.id};ts:{ts};`
    let dataId = ''
    try {
      const parsed = JSON.parse(rawBody) as { data?: { id?: string | number } }
      dataId = String(parsed?.data?.id ?? '')
    } catch { /* body não-JSON */ }

    // Construir string de validação
    const template = `id:${dataId};ts:${ts};`
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

// task-019: motivo distinto de falha de validacao, para que o audit log do
// webhook separe "assinatura HMAC invalida" de "timestamp expirado/replay"
// (antes colapsados num unico `false` -> mensagem generica "HMAC inválido").
export type WebhookValidationReason =
  | 'OK'
  | 'MISSING_SIGNATURE'
  | 'BAD_SIGNATURE'
  | 'TIMESTAMP_EXPIRED'
  | 'CONFIG_MISSING'

export interface WebhookValidationResult {
  valid: boolean
  reason: WebhookValidationReason
}

/**
 * Valida HMAC do Mercado Pago retornando o MOTIVO (nao so um booleano), para
 * permitir ao webhook distinguir assinatura invalida de replay/timestamp.
 */
export function validateMercadoPagoHMACDetailed(
  headers: Headers,
  rawBody: string,
  secret: string,
): WebhookValidationResult {
  try {
    const xSignature = headers.get('x-signature') ?? ''

    const tsMatch = xSignature.match(/ts=(\d+)/)
    const v1Match = xSignature.match(/v1=([a-f0-9]+)/i)

    if (!tsMatch || !v1Match) return { valid: false, reason: 'MISSING_SIGNATURE' }

    const ts = tsMatch[1]
    const v1 = v1Match[1]
    if (!ts || !v1) return { valid: false, reason: 'MISSING_SIGNATURE' }

    // Replay/timestamp (PAYMENT_002) — distinto de assinatura invalida.
    if (!validateWebhookTimestamp(parseInt(ts, 10) * 1000)) {
      return { valid: false, reason: 'TIMESTAMP_EXPIRED' }
    }

    // BUG FIX: o manifesto MP usa data.id do body, não o x-request-id do header.
    // Referência: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
    // Formato canônico: `id:{data.id};ts:{ts};`
    // O código anterior usava `id:{xRequestId};ts:{ts};` (errado) — todo webhook MP
    // era rejeitado como BAD_SIGNATURE, impedindo a ativação de planos após pagamento.
    let dataId = ''
    try {
      const parsed = JSON.parse(rawBody) as { data?: { id?: string | number } }
      dataId = String(parsed?.data?.id ?? '')
    } catch {
      // body não-JSON: dataId fica vazio → HMAC vai falhar, comportamento correto
    }

    const template = `id:${dataId};ts:${ts};`
    const expected = createHmac('sha256', secret).update(template).digest('hex')

    const expectedBuf = Buffer.from(expected, 'utf8')
    const receivedBuf = Buffer.from(v1, 'utf8')

    if (expectedBuf.length !== receivedBuf.length) {
      timingSafeEqual(expectedBuf, Buffer.alloc(expectedBuf.length))
      return { valid: false, reason: 'BAD_SIGNATURE' }
    }

    return timingSafeEqual(expectedBuf, receivedBuf)
      ? { valid: true, reason: 'OK' }
      : { valid: false, reason: 'BAD_SIGNATURE' }
  } catch {
    return { valid: false, reason: 'BAD_SIGNATURE' }
  }
}

/**
 * Valida HMAC pelo gateway detectado, retornando o motivo. PagSeguro/PayPal
 * nao expoem timestamp local, entao colapsam em OK/BAD_SIGNATURE.
 * @throws Error se gateway não suportado
 */
export async function validateWebhookByGatewayDetailed(
  headers: Headers,
  rawBody: string,
  gateway: GatewayType,
): Promise<WebhookValidationResult> {
  switch (gateway) {
    case GatewayType.MERCADO_PAGO: {
      const secret = env.MERCADO_PAGO_WEBHOOK_SECRET ?? ''
      if (!secret) return { valid: false, reason: 'CONFIG_MISSING' }
      return validateMercadoPagoHMACDetailed(headers, rawBody, secret)
    }
    case GatewayType.PAGSEGURO: {
      const secret = env.PAGSEGURO_WEBHOOK_SECRET ?? ''
      if (!secret) return { valid: false, reason: 'CONFIG_MISSING' }
      const valid = validatePagSeguroHMAC(headers, rawBody, secret)
      return { valid, reason: valid ? 'OK' : 'BAD_SIGNATURE' }
    }
    case GatewayType.PAYPAL: {
      const webhookId = env.PAYPAL_WEBHOOK_ID ?? ''
      if (!webhookId) return { valid: false, reason: 'CONFIG_MISSING' }
      const valid = await validatePayPalWebhook(headers, rawBody, webhookId)
      return { valid, reason: valid ? 'OK' : 'BAD_SIGNATURE' }
    }
    default: {
      const err = new Error(`Gateway não suportado para validação HMAC: ${gateway}`) as Error & { code: string }
      err.code = 'PAYMENT_052'
      throw err
    }
  }
}

/**
 * Valida HMAC pelo gateway detectado (booleano). Mantido para compatibilidade
 * com callers que so precisam do resultado binario (ex.: paypal.ts).
 * @throws Error se gateway não suportado
 */
export async function validateWebhookByGateway(
  headers:    Headers,
  rawBody:    string,
  gateway:    GatewayType
): Promise<boolean> {
  const { valid } = await validateWebhookByGatewayDetailed(headers, rawBody, gateway)
  return valid
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
