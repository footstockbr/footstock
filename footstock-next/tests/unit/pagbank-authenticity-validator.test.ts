/**
 * Testes unitarios — Item 008: detector/validador PagBank `/orders`.
 *
 * Esquema oficial PagBank (doc "confirmar autenticidade da notificacao"):
 *   x-authenticity-token == SHA-256(`${token}-${rawBody}`) em hex.
 *
 * NOTA sobre o criterio de aceite ("nenhum teste auto-referencial HMAC com
 * secret ficticio como prova principal"): a PROVA PRIMARIA aqui e o esquema
 * PagBank (SHA-256 de `token-payload`), exercitado com casos negativos reais
 * (token errado, header ausente, raw body alterado byte-a-byte). O HMAC legado
 * so aparece no contexto do fallback GATED, nunca como prova principal de
 * autenticidade.
 */

// Env mockado com objeto inline (jest hoista jest.mock acima dos imports;
// referenciar um const externo cairia em TDZ). As funcoes leem env.* em tempo
// de chamada, entao mutar o objeto mockado entre testes troca a config.
jest.mock('@/lib/env', () => ({
  env: {
    PAGSEGURO_NOTIFICATION_TOKEN: 'pagbank-notif-token-unit',
    PAGSEGURO_WEBHOOK_SECRET: 'legacy-hmac-secret-unit',
    PAGSEGURO_LEGACY_HMAC_FALLBACK: 'false',
    ACTIVE_GATEWAY: undefined,
  },
}))

jest.mock('@/lib/observability/degradation-signal', () => ({
  emitDegradationSignal: jest.fn(() => true),
}))

import { createHash, createHmac } from 'crypto'
import {
  validatePagBankAuthenticity,
  isPagSeguroLegacyHmacFallbackEnabled,
  validateWebhookByGatewayDetailed,
  __resetWebhookSecretHealthCheck,
} from '@/lib/gateways/webhook-validator'
import { GatewayType } from '@/lib/gateways/IGateway'
import { env } from '@/lib/env'
import { emitDegradationSignal } from '@/lib/observability/degradation-signal'

// Handles para os modulos mockados (mesma referencia que o validador enxerga).
const mockEnv = env as unknown as Record<string, string | undefined>
const emitMock = emitDegradationSignal as unknown as jest.Mock

const TOKEN = 'pagbank-notif-token-unit'
const SECRET = 'legacy-hmac-secret-unit'

// Payload realista de webhook PagBank `/orders` (charges[0].status).
const BODY = JSON.stringify({
  id: 'ORDE_0000-1111',
  reference_id: 'sub_abc123',
  charges: [{ id: 'CHAR_2222', status: 'PAID', amount: { value: 60000 } }],
})

/** Assinatura PagBank canonica: SHA-256(`${token}-${body}`). */
function authToken(token: string, body: string): string {
  return createHash('sha256').update(`${token}-${body}`, 'utf8').digest('hex')
}

/** HMAC legado do PagSeguro (so para o caminho de fallback gated). */
function legacyHmac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

beforeEach(() => {
  mockEnv.PAGSEGURO_NOTIFICATION_TOKEN = TOKEN
  mockEnv.PAGSEGURO_WEBHOOK_SECRET = SECRET
  mockEnv.PAGSEGURO_LEGACY_HMAC_FALLBACK = 'false'
  mockEnv.ACTIVE_GATEWAY = undefined
  emitMock.mockClear()
  __resetWebhookSecretHealthCheck()
})

describe('validatePagBankAuthenticity — esquema primario x-authenticity-token (SHA-256 token-payload)', () => {
  it('aceita assinatura valida (SHA-256 do token-payload bate com o header)', () => {
    const headers = new Headers({ 'x-authenticity-token': authToken(TOKEN, BODY) })
    expect(validatePagBankAuthenticity(headers, BODY, TOKEN)).toEqual({ valid: true, reason: 'OK' })
  })

  it('rejeita assinatura invalida (assinada com token errado) -> BAD_SIGNATURE', () => {
    const headers = new Headers({ 'x-authenticity-token': authToken('token-do-atacante', BODY) })
    expect(validatePagBankAuthenticity(headers, BODY, TOKEN)).toEqual({ valid: false, reason: 'BAD_SIGNATURE' })
  })

  it('header x-authenticity-token ausente -> MISSING_SIGNATURE', () => {
    const headers = new Headers({ 'content-type': 'application/json' })
    expect(validatePagBankAuthenticity(headers, BODY, TOKEN)).toEqual({ valid: false, reason: 'MISSING_SIGNATURE' })
  })

  it('raw body ALTERADO apos a assinatura -> BAD_SIGNATURE (binding byte-exato ao payload)', () => {
    // Assinatura computada sobre o body original; validacao contra body adulterado.
    const sig = authToken(TOKEN, BODY)
    const tampered = BODY.replace('"value":60000', '"value":1')
    const headers = new Headers({ 'x-authenticity-token': sig })
    expect(validatePagBankAuthenticity(headers, tampered, TOKEN)).toEqual({ valid: false, reason: 'BAD_SIGNATURE' })
  })

  it('diferenca de UM byte (espaco) no raw body -> BAD_SIGNATURE (sem reserializar)', () => {
    const sig = authToken(TOKEN, BODY)
    const headers = new Headers({ 'x-authenticity-token': sig })
    expect(validatePagBankAuthenticity(headers, BODY + ' ', TOKEN)).toEqual({ valid: false, reason: 'BAD_SIGNATURE' })
  })

  it('assinatura com tamanho divergente (truncada) -> BAD_SIGNATURE (caminho timing-safe pad)', () => {
    const headers = new Headers({ 'x-authenticity-token': 'deadbeef' })
    expect(validatePagBankAuthenticity(headers, BODY, TOKEN)).toEqual({ valid: false, reason: 'BAD_SIGNATURE' })
  })

  it('KAT: digesto INDEPENDENTE fixa ordem+separador (token-payload) ao spec PagBank', () => {
    // Vetor known-answer: o hex abaixo NAO e recomputado pela mesma expressao do
    // codigo de producao; foi gerado por ferramenta externa:
    //   printf '%s' 'kat-token-{"id":"ORDE_KAT"}' | sha256sum
    //   == python3 hashlib.sha256(...).hexdigest()
    // Se alguem trocar a ordem/separador (ex.: `${payload}-${token}` ou
    // `${token}:${payload}`) em producao, este teste falha VERMELHO mesmo que o
    // helper auto-referencial continue passando. Pina o formato ao doc PagBank.
    const KAT_TOKEN = 'kat-token'
    const KAT_BODY = '{"id":"ORDE_KAT"}'
    const KAT_DIGEST = 'ece1678ee7fd0e758514444853d11a8c9ded9faf1c5fe5cbe81cd93d446eb240'
    const headers = new Headers({ 'x-authenticity-token': KAT_DIGEST })
    expect(validatePagBankAuthenticity(headers, KAT_BODY, KAT_TOKEN)).toEqual({ valid: true, reason: 'OK' })
  })

  it('defense-in-depth: token vazio NUNCA autentica (mesmo com header forjado) -> CONFIG_MISSING', () => {
    // Sem o guard, expected = sha256(`-${body}`), forjavel por quem controla o body.
    const forged = createHash('sha256').update(`-${BODY}`, 'utf8').digest('hex')
    const headers = new Headers({ 'x-authenticity-token': forged })
    expect(validatePagBankAuthenticity(headers, BODY, '')).toEqual({ valid: false, reason: 'CONFIG_MISSING' })
    expect(validatePagBankAuthenticity(headers, BODY, '   ')).toEqual({ valid: false, reason: 'CONFIG_MISSING' })
  })
})

describe('validateWebhookByGatewayDetailed — PagSeguro/PagBank (dispatcher)', () => {
  it('x-authenticity-token valido com token configurado -> OK', async () => {
    const headers = new Headers({ 'x-authenticity-token': authToken(TOKEN, BODY) })
    await expect(
      validateWebhookByGatewayDetailed(headers, BODY, GatewayType.PAGSEGURO),
    ).resolves.toEqual({ valid: true, reason: 'OK' })
  })

  it('x-authenticity-token presente mas PAGSEGURO_NOTIFICATION_TOKEN ausente -> CONFIG_MISSING + alerta auditavel', async () => {
    mockEnv.PAGSEGURO_NOTIFICATION_TOKEN = undefined
    const headers = new Headers({ 'x-authenticity-token': authToken(TOKEN, BODY) })
    await expect(
      validateWebhookByGatewayDetailed(headers, BODY, GatewayType.PAGSEGURO),
    ).resolves.toEqual({ valid: false, reason: 'CONFIG_MISSING' })
    expect(emitMock).toHaveBeenCalledWith(
      'webhook.config_missing',
      expect.objectContaining({ level: 'alert' }),
    )
  })

  it('nenhum header de assinatura -> MISSING_SIGNATURE', async () => {
    const headers = new Headers({ 'content-type': 'application/json' })
    await expect(
      validateWebhookByGatewayDetailed(headers, BODY, GatewayType.PAGSEGURO),
    ).resolves.toEqual({ valid: false, reason: 'MISSING_SIGNATURE' })
  })
})

describe('Fallback HMAC legado (x-pagseguro-signature) — gated por feature flag', () => {
  it('flag OFF (default): assinatura legada VALIDA e REJEITADA (BAD_SIGNATURE) + alerta auditavel', async () => {
    expect(isPagSeguroLegacyHmacFallbackEnabled()).toBe(false)
    const headers = new Headers({ 'x-pagseguro-signature': legacyHmac(SECRET, BODY) })
    await expect(
      validateWebhookByGatewayDetailed(headers, BODY, GatewayType.PAGSEGURO),
    ).resolves.toEqual({ valid: false, reason: 'BAD_SIGNATURE' })
    expect(emitMock).toHaveBeenCalledWith(
      'webhook.pagseguro_legacy_fallback_blocked',
      expect.objectContaining({ level: 'alert' }),
    )
  })

  it('flag ON: assinatura legada valida -> OK + sinal de deprecacao (uso logado)', async () => {
    mockEnv.PAGSEGURO_LEGACY_HMAC_FALLBACK = 'true'
    expect(isPagSeguroLegacyHmacFallbackEnabled()).toBe(true)
    const headers = new Headers({ 'x-pagseguro-signature': legacyHmac(SECRET, BODY) })
    await expect(
      validateWebhookByGatewayDetailed(headers, BODY, GatewayType.PAGSEGURO),
    ).resolves.toEqual({ valid: true, reason: 'OK' })
    expect(emitMock).toHaveBeenCalledWith(
      'webhook.pagseguro_legacy_fallback_used',
      expect.objectContaining({ level: 'warn' }),
    )
  })

  it('flag ON mas assinatura legada invalida -> BAD_SIGNATURE', async () => {
    mockEnv.PAGSEGURO_LEGACY_HMAC_FALLBACK = 'true'
    const headers = new Headers({ 'x-pagseguro-signature': legacyHmac('secret-errado', BODY) })
    await expect(
      validateWebhookByGatewayDetailed(headers, BODY, GatewayType.PAGSEGURO),
    ).resolves.toEqual({ valid: false, reason: 'BAD_SIGNATURE' })
  })

  it('flag ON mas PAGSEGURO_WEBHOOK_SECRET ausente -> CONFIG_MISSING + alerta auditavel', async () => {
    mockEnv.PAGSEGURO_LEGACY_HMAC_FALLBACK = 'true'
    mockEnv.PAGSEGURO_WEBHOOK_SECRET = undefined
    const headers = new Headers({ 'x-pagseguro-signature': 'qualquer-assinatura' })
    await expect(
      validateWebhookByGatewayDetailed(headers, BODY, GatewayType.PAGSEGURO),
    ).resolves.toEqual({ valid: false, reason: 'CONFIG_MISSING' })
    expect(emitMock).toHaveBeenCalledWith(
      'webhook.config_missing',
      expect.objectContaining({ level: 'alert' }),
    )
  })

  it('precedencia: x-authenticity-token vence x-pagseguro-signature mesmo com flag ON', async () => {
    mockEnv.PAGSEGURO_LEGACY_HMAC_FALLBACK = 'true'
    const headers = new Headers({
      'x-authenticity-token': authToken(TOKEN, BODY),
      'x-pagseguro-signature': 'qualquer-coisa-legada',
    })
    await expect(
      validateWebhookByGatewayDetailed(headers, BODY, GatewayType.PAGSEGURO),
    ).resolves.toEqual({ valid: true, reason: 'OK' })
  })
})
