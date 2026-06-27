// ============================================================================
// FootStock — resolucao em runtime dos gateways de checkout HABILITADOS
// ----------------------------------------------------------------------------
// SERVER-ONLY: importa `env` (credenciais) e por isso NUNCA pode ser importado
// por um client component. Consumidores client usam /api/v1/payments/gateways
// (+ hook useCheckoutGateways); consumidores server (ex.: pagina /planos)
// chamam resolveEnabledCheckoutGateways() direto e passam como prop.
//
// Um gateway so e oferecido ao cliente quando passa por um GATE de DUAS FASES
// (Item 009 — endurecimento do gate de PagSeguro):
//
//   FASE A (higiene de config) avalia a CREDENCIAL DE HABILITACAO do gateway
//     (o token de transacao/API que CRIA cobrancas) e curto-circuita, nessa
//     ordem de precedencia, em:
//       EMPTY            -> credencial de habilitacao ausente/em branco
//       PLACEHOLDER      -> credencial com valor de exemplo/placeholder
//       SANDBOX_IN_PROD  -> credencial de sandbox com NODE_ENV=production
//     Qualquer positivo desabilita o gateway e a FASE B nao roda.
//
//   FASE B (readiness de autenticidade do webhook) so roda se a FASE A passou.
//     Avalia um insumo INDEPENDENTE da FASE A (para PagSeguro:
//     PAGSEGURO_NOTIFICATION_TOKEN, o token de autenticidade do webhook /orders
//     definido no Item 008 — NUNCA PAGSEGURO_WEBHOOK_SECRET, que e fallback HMAC
//     legado e nao prova autenticidade real). Retorna:
//       WEBHOOK_UNCONFIRMED -> credencial de webhook ausente/placeholder
//       VALID               -> habilitacao OK E webhook confirmavel
//
// So um gateway em estado VALID aparece no seletor de checkout. Como a credencial
// de habilitacao (FASE A) e a credencial de webhook (FASE B) sao insumos
// DISTINTOS, WEBHOOK_UNCONFIRMED e um estado realmente atingivel (habilitacao OK,
// autenticidade ainda nao pronta).
//
// Heranca da FIX-19: oferecer um gateway sem credencial cria uma Subscription
// PENDING orfa e devolve DECLINED. O gate fecha esse buraco no unico ponto de
// resolucao (consumido por /api/v1/payments/gateways e pela pagina /planos).
//
// Contrato de LOG (servidor/observabilidade, NAO e UI): a resolucao nunca e
// silenciosa. Quando TODOS os gateways estao em EMPTY, emite
// NO_GATEWAY_CONFIGURED. Quando havia config porem o hardening desabilitou um
// gateway (estado != EMPTY e != VALID), emite GATEWAY_DISABLED_BY_HARDENING
// carregando o estado-causa. Os dois sao mutuamente exclusivos por gateway.
//
// Contrato de UI: a UI consome apenas a lista de gateways VALID. Nenhum codigo
// tecnico (*_BY_HARDENING, nomes de env) vaza para o cliente final — PagSeguro
// simplesmente NAO aparece no seletor enquanto estado != VALID.
// ============================================================================

import 'server-only'

import { env } from '@/lib/env'
import { emitDegradationSignal } from '@/lib/observability/degradation-signal'
import {
  ALL_CHECKOUT_GATEWAYS,
  type CheckoutGateway,
} from '@/lib/constants/checkout-gateways'

// ─── Estados do gate ─────────────────────────────────────────────────────────

/**
 * Estados do gate de habilitacao de um gateway, em precedencia de avaliacao.
 * Os tres primeiros sao higiene de config (FASE A, sobre a credencial de
 * habilitacao); WEBHOOK_UNCONFIRMED e readiness operacional (FASE B); VALID
 * exige ambas as fases verdes.
 */
export type GatewayGateState =
  | 'EMPTY'
  | 'PLACEHOLDER'
  | 'SANDBOX_IN_PROD'
  | 'WEBHOOK_UNCONFIRMED'
  | 'VALID'

/** Estados que sinalizam "havia config, mas o hardening desabilitou". */
export type GatewayDisabledCause = 'PLACEHOLDER' | 'SANDBOX_IN_PROD' | 'WEBHOOK_UNCONFIRMED'

// ─── Heuristicas de higiene ──────────────────────────────────────────────────

/** Vazio/em branco conta como ausente. */
function isBlank(value: string | undefined): boolean {
  return !value || value.trim() === ''
}

/**
 * Detecta valores de exemplo/placeholder copiados de templates de env. NAO pode
 * marcar tokens reais (ex.: `APP_USR-...` do Mercado Pago) como placeholder, por
 * isso casa apenas marcadores inequivocos de template (pt-BR e en).
 */
const PLACEHOLDER_PATTERN =
  /x{4,}|your[-_ ]|seu[-_ ]|change[-_ ]?me|replace|placeholder|example|exemplo|dummy|todo|coloque|preencha|token-here|<[^>]*>|\.\.\.|…/i

export function looksLikePlaceholder(value: string | undefined): boolean {
  if (isBlank(value)) return false
  return PLACEHOLDER_PATTERN.test(value!.trim())
}

/** Marcador explicito de sandbox no proprio valor do token. */
function tokenLooksSandbox(value: string | undefined): boolean {
  if (isBlank(value)) return false
  const v = value!.trim()
  // MP usa prefixo TEST- para tokens de teste; demais usam o literal "sandbox".
  return /sandbox/i.test(v) || /^TEST-/.test(v)
}

/** Flag de env de sandbox: presente e diferente de 'false' => sandbox ligado. */
function sandboxFlagOn(flag: string | undefined): boolean {
  return flag !== undefined && flag.trim() !== '' && flag.trim() !== 'false'
}

function isProduction(): boolean {
  return env.NODE_ENV === 'production'
}

// ─── Descritor por gateway ───────────────────────────────────────────────────

interface GatewayGateDescriptor {
  /** FASE A — credenciais de habilitacao (transacao/API). Todas obrigatorias. */
  enablingCredentials: () => string[]
  /** FASE A — credencial e sandbox (token de sandbox ou flag de sandbox ligada). */
  isSandbox: () => boolean
  /** FASE B — credencial de readiness de autenticidade do webhook. */
  webhookReadinessCredential: () => string | undefined
}

function gateDescriptor(gateway: CheckoutGateway): GatewayGateDescriptor {
  switch (gateway) {
    case 'MERCADO_PAGO':
      return {
        enablingCredentials: () => [env.MERCADO_PAGO_ACCESS_TOKEN ?? ''],
        isSandbox: () => tokenLooksSandbox(env.MERCADO_PAGO_ACCESS_TOKEN),
        webhookReadinessCredential: () => env.MERCADO_PAGO_WEBHOOK_SECRET,
      }
    case 'PAGSEGURO':
      return {
        // FASE A le a credencial de habilitacao do gateway (PAGSEGURO_TOKEN),
        // NUNCA o token de autenticidade do webhook.
        enablingCredentials: () => [env.PAGSEGURO_TOKEN ?? ''],
        isSandbox: () =>
          sandboxFlagOn(env.PAGSEGURO_SANDBOX) || tokenLooksSandbox(env.PAGSEGURO_TOKEN),
        // FASE B le o token de autenticidade do webhook /orders (Item 008),
        // NUNCA PAGSEGURO_WEBHOOK_SECRET (fallback HMAC legado, gated/desligado).
        webhookReadinessCredential: () => env.PAGSEGURO_NOTIFICATION_TOKEN,
      }
    case 'PAYPAL':
      return {
        enablingCredentials: () => [env.PAYPAL_CLIENT_ID ?? '', env.PAYPAL_CLIENT_SECRET ?? ''],
        isSandbox: () =>
          sandboxFlagOn(env.PAYPAL_SANDBOX) ||
          tokenLooksSandbox(env.PAYPAL_CLIENT_ID) ||
          tokenLooksSandbox(env.PAYPAL_CLIENT_SECRET),
        webhookReadinessCredential: () => env.PAYPAL_WEBHOOK_ID,
      }
  }
}

// ─── Avaliacao de estado ─────────────────────────────────────────────────────

/**
 * Avalia o estado do gate para um gateway aplicando as duas fases com
 * precedencia EMPTY -> PLACEHOLDER -> SANDBOX_IN_PROD (FASE A) -> WEBHOOK_UNCONFIRMED
 * (FASE B) -> VALID. Funcao pura sobre `env`.
 */
export function evaluateGatewayState(gateway: CheckoutGateway): GatewayGateState {
  const d = gateDescriptor(gateway)
  const enabling = d.enablingCredentials()

  // FASE A — higiene de config da credencial de habilitacao.
  if (enabling.some(isBlank)) return 'EMPTY'
  if (enabling.some(looksLikePlaceholder)) return 'PLACEHOLDER'
  if (d.isSandbox() && isProduction()) return 'SANDBOX_IN_PROD'

  // FASE B — readiness de autenticidade do webhook (insumo independente).
  const webhookCred = d.webhookReadinessCredential()
  if (isBlank(webhookCred) || looksLikePlaceholder(webhookCred)) return 'WEBHOOK_UNCONFIRMED'

  return 'VALID'
}

/** Backward-compatible: um gateway esta "configurado" sse seu estado e VALID. */
export function isCheckoutGatewayConfigured(gateway: CheckoutGateway): boolean {
  return evaluateGatewayState(gateway) === 'VALID'
}

// ─── Contrato de log (servidor) ──────────────────────────────────────────────

export type GatewayGateLog =
  | { code: 'NO_GATEWAY_CONFIGURED' }
  | { code: 'GATEWAY_DISABLED_BY_HARDENING'; gateway: CheckoutGateway; cause: GatewayDisabledCause }

/**
 * Deriva, de forma pura, os codigos de log do contrato de observabilidade a
 * partir do mapa de estados. Mutuamente exclusivos por gateway:
 *  - todos EMPTY            -> [NO_GATEWAY_CONFIGURED]
 *  - havia config (estado != EMPTY) mas != VALID -> um GATEWAY_DISABLED_BY_HARDENING
 *    por gateway nessa situacao, carregando o estado-causa.
 *  - gateways VALID nao geram log; gateways EMPTY nao geram log enquanto algum
 *    outro estiver configurado (so o caso "todos EMPTY" fala via NO_GATEWAY_CONFIGURED).
 */
export function computeGatewayGateLogs(
  states: Record<CheckoutGateway, GatewayGateState>,
): GatewayGateLog[] {
  const entries = ALL_CHECKOUT_GATEWAYS.map((g) => [g, states[g]] as const)
  const configured = entries.filter(([, state]) => state !== 'EMPTY')

  if (configured.length === 0) {
    return [{ code: 'NO_GATEWAY_CONFIGURED' }]
  }

  return configured
    .filter(([, state]) => state !== 'VALID')
    .map(([gateway, state]) => ({
      code: 'GATEWAY_DISABLED_BY_HARDENING' as const,
      gateway,
      cause: state as GatewayDisabledCause,
    }))
}

/** Emite os codigos de log via degradation-signal (best-effort, com throttle). */
function emitGatewayGateLogs(logs: GatewayGateLog[]): void {
  for (const logEntry of logs) {
    if (logEntry.code === 'NO_GATEWAY_CONFIGURED') {
      emitDegradationSignal('payments.no_gateway_configured', {
        level: 'alert',
        context: { code: 'NO_GATEWAY_CONFIGURED' },
      })
    } else {
      emitDegradationSignal('payments.gateway_disabled_by_hardening', {
        level: 'alert',
        context: {
          code: 'GATEWAY_DISABLED_BY_HARDENING',
          gateway: logEntry.gateway,
          cause: logEntry.cause,
        },
      })
    }
  }
}

// ─── Resolucao ───────────────────────────────────────────────────────────────

/**
 * Lista, na ordem canonica, os gateways efetivamente oferecidos ao cliente
 * (estado VALID). Pode retornar [] quando nenhum gateway esta VALID — a UI trata
 * esse caso como "pagamento temporariamente indisponivel" (Zero Silencio), nunca
 * como select vazio mudo. No mesmo ponto emite o contrato de log do servidor.
 */
export function resolveEnabledCheckoutGateways(): CheckoutGateway[] {
  const states = Object.fromEntries(
    ALL_CHECKOUT_GATEWAYS.map((g) => [g, evaluateGatewayState(g)]),
  ) as Record<CheckoutGateway, GatewayGateState>

  emitGatewayGateLogs(computeGatewayGateLogs(states))

  return ALL_CHECKOUT_GATEWAYS.filter((g) => states[g] === 'VALID')
}
