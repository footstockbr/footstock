// ============================================================================
// FootStock — Validadores HMAC por gateway de pagamento
// PCI-DSS: usa timingSafeEqual para prevenir timing attacks
// Referência: PAYMENT_001 (HMAC inválido), PAYMENT_002 (timestamp expirado)
// ============================================================================

import { createHmac, timingSafeEqual } from 'crypto'
import { WEBHOOK_REPLAY_WINDOW_MS } from '@/lib/constants/payment-security'
import { GatewayType } from './IGateway'
import { env } from '@/lib/env'
import { emitDegradationSignal } from '@/lib/observability/degradation-signal'

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
  // Spec MP: o `data.id` do manifesto vem do QUERY PARAM da URL (`?data.id=...`), não do
  // corpo. O caller (rota) extrai e passa esse valor. Quando ausente, caímos no body como
  // compat (webhooks de pagamento têm o mesmo id nos dois lugares).
  dataIdFromUrl?: string,
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

    // Manifesto canônico do Mercado Pago (doc oficial):
    //   id:{data.id};request-id:{x-request-id};ts:{ts};
    //   - id         = data.id do body/URL (lowercase se alfanumérico; numérico p/ pagamentos)
    //   - request-id = header x-request-id — SEMPRE presente em notificação de pagamento real;
    //                  o segmento só é omitido quando o header de fato não vem (regra MP:
    //                  "if any of the values are not present, remove them").
    //   - ts         = timestamp do header x-signature
    // Referência: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
    //
    // Histórico do bug: o manifesto já errou de DUAS formas — primeiro usando o x-request-id
    // como VALOR de `id:` (commit antigo), depois REMOVENDO o segmento `request-id:` inteiro
    // (commit 59bb34e, "corrige HMAC MP"). Esta segunda versão rejeitava 100% dos webhooks
    // reais como BAD_SIGNATURE (que sempre trazem x-request-id), impedindo a ativação do plano
    // após pagamento aprovado. A correção mantém o `id:` certo E reintroduz o `request-id:`.
    // Fonte do data.id: PRIMEIRO o query param da URL (canônico p/ o HMAC do MP); só caímos
    // no body quando o caller não forneceu (compat com chamadas antigas/testes). Para webhooks
    // de pagamento os dois coincidem; preferir a URL evita divergência em formatos onde diferem.
    let dataId = (dataIdFromUrl ?? '').trim()
    if (!dataId) {
      try {
        const parsed = JSON.parse(rawBody) as { data?: { id?: string | number } }
        dataId = String(parsed?.data?.id ?? '')
      } catch {
        // body não-JSON e sem data.id na URL → dataId vazio → HMAC falha (correto)
      }
    }
    // Normalização MP: id alfanumérico vai em lowercase (no-op p/ id numérico de pagamento)
    if (/[a-z]/i.test(dataId)) dataId = dataId.toLowerCase()

    const xRequestId = headers.get('x-request-id') ?? ''
    const template = xRequestId
      ? `id:${dataId};request-id:${xRequestId};ts:${ts};`
      : `id:${dataId};ts:${ts};`
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

// ─── Health-check do webhook secret (FIX-14) ──────────────────────────────────

export interface WebhookSecretHealth {
  /** Gateway ativo (env.ACTIVE_GATEWAY) ou null quando não declarado. */
  gateway: GatewayType | null
  /** true quando o secret obrigatório do gateway ativo está presente. */
  ok: boolean
  /** Nome da env var faltante, quando ok === false. */
  missingVar: string | null
}

/**
 * Verifica que o gateway ativo (env.ACTIVE_GATEWAY) tem seu webhook secret
 * configurado. Complementa o fail-fast de boot em env.ts (FIX-24), que só
 * dispara quando ACTIVE_GATEWAY está declarado: aqui emitimos um ALERTA
 * observável (sem lançar) para o caso em que um gateway é usado em runtime sem
 * o secret correspondente. Quando ACTIVE_GATEWAY não está setado, é no-op
 * (dev/test/CI não disparam o alerta).
 */
export function runWebhookSecretHealthCheck(): WebhookSecretHealth {
  const active = env.ACTIVE_GATEWAY as GatewayType | undefined
  if (!active) return { gateway: null, ok: true, missingVar: null }

  let secret = ''
  let varName = ''
  switch (active) {
    case GatewayType.MERCADO_PAGO:
      secret = env.MERCADO_PAGO_WEBHOOK_SECRET ?? ''
      varName = 'MERCADO_PAGO_WEBHOOK_SECRET'
      break
    case GatewayType.PAGSEGURO:
      secret = env.PAGSEGURO_WEBHOOK_SECRET ?? ''
      varName = 'PAGSEGURO_WEBHOOK_SECRET'
      break
    case GatewayType.PAYPAL:
      secret = env.PAYPAL_WEBHOOK_ID ?? ''
      varName = 'PAYPAL_WEBHOOK_ID'
      break
    default:
      return { gateway: active, ok: true, missingVar: null }
  }

  if (!secret) {
    emitDegradationSignal('webhook.secret_health_check_failed', {
      level: 'alert',
      throttleMs: 0,
      context: { gateway: active, missingVar: varName },
    })
    return { gateway: active, ok: false, missingVar: varName }
  }
  return { gateway: active, ok: true, missingVar: null }
}

let _healthCheckRan = false

/** Roda o health-check de secret uma única vez (primeira validação real). */
function ensureWebhookSecretHealthChecked(): void {
  if (_healthCheckRan) return
  _healthCheckRan = true
  try {
    runWebhookSecretHealthCheck()
  } catch {
    /* fail-open: health-check nunca quebra a validação do webhook */
  }
}

/** Reset do memo do health-check. Apenas para testes deterministas. */
export function __resetWebhookSecretHealthCheck(): void {
  _healthCheckRan = false
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
  // data.id do query param da URL (usado só pelo manifesto HMAC do Mercado Pago)
  dataIdFromUrl?: string,
): Promise<WebhookValidationResult> {
  // FIX-14: health-check do secret na primeira validação real (lazy boot check).
  // Não há boot-hook único no Next.js; ancoramos no primeiro webhook. Idempotente
  // e fail-open — apenas emite alerta quando o secret do gateway ativo falta.
  ensureWebhookSecretHealthChecked()

  switch (gateway) {
    case GatewayType.MERCADO_PAGO: {
      const secret = env.MERCADO_PAGO_WEBHOOK_SECRET ?? ''
      if (!secret) {
        // FIX-14: CONFIG_MISSING era um `false` silencioso — webhook real chega,
        // o secret não está configurado e a validação falha sem nenhum sinal.
        // Agora alerta (console.error + Sentry) para o operador agir.
        emitDegradationSignal('webhook.config_missing', {
          level: 'alert',
          context: { gateway: GatewayType.MERCADO_PAGO, secret: 'MERCADO_PAGO_WEBHOOK_SECRET' },
        })
        return { valid: false, reason: 'CONFIG_MISSING' }
      }
      return validateMercadoPagoHMACDetailed(headers, rawBody, secret, dataIdFromUrl)
    }
    case GatewayType.PAGSEGURO: {
      const secret = env.PAGSEGURO_WEBHOOK_SECRET ?? ''
      if (!secret) {
        emitDegradationSignal('webhook.config_missing', {
          level: 'alert',
          context: { gateway: GatewayType.PAGSEGURO, secret: 'PAGSEGURO_WEBHOOK_SECRET' },
        })
        return { valid: false, reason: 'CONFIG_MISSING' }
      }
      const valid = validatePagSeguroHMAC(headers, rawBody, secret)
      return { valid, reason: valid ? 'OK' : 'BAD_SIGNATURE' }
    }
    case GatewayType.PAYPAL: {
      const webhookId = env.PAYPAL_WEBHOOK_ID ?? ''
      if (!webhookId) {
        emitDegradationSignal('webhook.config_missing', {
          level: 'alert',
          context: { gateway: GatewayType.PAYPAL, secret: 'PAYPAL_WEBHOOK_ID' },
        })
        return { valid: false, reason: 'CONFIG_MISSING' }
      }
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
