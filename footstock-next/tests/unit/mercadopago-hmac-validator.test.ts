/**
 * Testes unitários — validateMercadoPagoHMACDetailed (manifesto HMAC do Mercado Pago)
 *
 * REGRESSÃO: o manifesto canônico do MP é `id:{data.id};request-id:{x-request-id};ts:{ts};`.
 * O bug do commit 59bb34e removeu o segmento `request-id:` inteiro, rejeitando 100% dos
 * webhooks reais (que sempre trazem x-request-id) como BAD_SIGNATURE e impedindo a ativação
 * de plano após pagamento aprovado. Estes testes travam o formato para impedir a regressão.
 * Doc oficial: https://www.mercadopago.com.br/developers/en/docs/your-integrations/notifications/webhooks
 */

jest.mock('@/lib/env', () => ({
  env: {
    MERCADO_PAGO_WEBHOOK_SECRET: 'unit-test-secret',
  },
}))

import { createHmac } from 'crypto'
import { validateMercadoPagoHMACDetailed } from '@/lib/gateways/webhook-validator'

const SECRET = 'unit-test-secret'
const DATA_ID = '164446423886'

function hmac(manifest: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(manifest).digest('hex')
}

function nowTs(): string {
  return Math.floor(Date.now() / 1000).toString()
}

function body(dataId: string = DATA_ID): string {
  return JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: dataId } })
}

describe('validateMercadoPagoHMACDetailed — manifesto canônico id;request-id;ts', () => {
  it('aceita assinatura assinada com o manifesto canônico (id+request-id+ts)', () => {
    const ts = nowTs()
    const requestId = 'req-uuid-abc-123'
    const v1 = hmac(`id:${DATA_ID};request-id:${requestId};ts:${ts};`)
    const headers = new Headers({
      'x-signature': `ts=${ts},v1=${v1}`,
      'x-request-id': requestId,
    })

    expect(validateMercadoPagoHMACDetailed(headers, body(), SECRET)).toEqual({
      valid: true,
      reason: 'OK',
    })
  })

  it('REGRESSÃO: rejeita assinatura do manifesto SEM request-id quando o header x-request-id está presente', () => {
    // Reproduz o bug 59bb34e: servidor computava `id:{data.id};ts:{ts};` (sem request-id).
    // Uma assinatura real do MP (com request-id) NÃO bate contra esse manifesto → o teste #1
    // garante o caminho feliz; este garante que o manifesto truncado não é aceito por engano.
    const ts = nowTs()
    const requestId = 'req-uuid-abc-123'
    const v1Truncado = hmac(`id:${DATA_ID};ts:${ts};`) // sem request-id
    const headers = new Headers({
      'x-signature': `ts=${ts},v1=${v1Truncado}`,
      'x-request-id': requestId,
    })

    expect(validateMercadoPagoHMACDetailed(headers, body(), SECRET)).toEqual({
      valid: false,
      reason: 'BAD_SIGNATURE',
    })
  })

  it('sem header x-request-id: cai no manifesto id;ts (regra MP "remova o campo ausente")', () => {
    const ts = nowTs()
    const v1 = hmac(`id:${DATA_ID};ts:${ts};`)
    const headers = new Headers({ 'x-signature': `ts=${ts},v1=${v1}` })

    expect(validateMercadoPagoHMACDetailed(headers, body(), SECRET)).toEqual({
      valid: true,
      reason: 'OK',
    })
  })

  it('assinatura válida mas secret errado → BAD_SIGNATURE', () => {
    const ts = nowTs()
    const requestId = 'req-1'
    const v1 = hmac(`id:${DATA_ID};request-id:${requestId};ts:${ts};`, 'secret-errado')
    const headers = new Headers({
      'x-signature': `ts=${ts},v1=${v1}`,
      'x-request-id': requestId,
    })

    expect(validateMercadoPagoHMACDetailed(headers, body(), SECRET)).toEqual({
      valid: false,
      reason: 'BAD_SIGNATURE',
    })
  })

  it('header x-signature ausente → MISSING_SIGNATURE', () => {
    const headers = new Headers({ 'x-request-id': 'req-1' })
    expect(validateMercadoPagoHMACDetailed(headers, body(), SECRET)).toEqual({
      valid: false,
      reason: 'MISSING_SIGNATURE',
    })
  })

  it('timestamp fora da janela de replay → TIMESTAMP_EXPIRED', () => {
    const oldTs = (Math.floor(Date.now() / 1000) - 60 * 60).toString() // 1h atrás
    const requestId = 'req-1'
    const v1 = hmac(`id:${DATA_ID};request-id:${requestId};ts:${oldTs};`)
    const headers = new Headers({
      'x-signature': `ts=${oldTs},v1=${v1}`,
      'x-request-id': requestId,
    })

    expect(validateMercadoPagoHMACDetailed(headers, body(), SECRET)).toEqual({
      valid: false,
      reason: 'TIMESTAMP_EXPIRED',
    })
  })
})

describe('validateMercadoPagoHMACDetailed — data.id da URL tem precedência sobre o body (spec MP)', () => {
  it('usa o data.id do query param da URL para o HMAC (não o do body)', () => {
    const ts = nowTs()
    const requestId = 'req-1'
    const urlDataId = '164446423886'
    const bodyDataId = '999999999' // body diverge da URL de propósito
    // Assinatura computada com o data.id da URL (fonte canônica do MP)
    const v1 = hmac(`id:${urlDataId};request-id:${requestId};ts:${ts};`)
    const headers = new Headers({
      'x-signature': `ts=${ts},v1=${v1}`,
      'x-request-id': requestId,
    })

    expect(
      validateMercadoPagoHMACDetailed(headers, body(bodyDataId), SECRET, urlDataId),
    ).toEqual({ valid: true, reason: 'OK' })
  })

  it('REGRESSÃO: assinatura computada com o data.id do BODY é rejeitada quando a URL fornece outro id', () => {
    const ts = nowTs()
    const requestId = 'req-1'
    const urlDataId = '164446423886'
    const bodyDataId = '999999999'
    // Assinatura "errada": usou o id do body, mas o validator deve assinar com o da URL
    const v1Body = hmac(`id:${bodyDataId};request-id:${requestId};ts:${ts};`)
    const headers = new Headers({
      'x-signature': `ts=${ts},v1=${v1Body}`,
      'x-request-id': requestId,
    })

    expect(
      validateMercadoPagoHMACDetailed(headers, body(bodyDataId), SECRET, urlDataId),
    ).toEqual({ valid: false, reason: 'BAD_SIGNATURE' })
  })

  it('sem data.id na URL: cai no body (compat com callers antigos/testes)', () => {
    const ts = nowTs()
    const requestId = 'req-1'
    const v1 = hmac(`id:${DATA_ID};request-id:${requestId};ts:${ts};`)
    const headers = new Headers({
      'x-signature': `ts=${ts},v1=${v1}`,
      'x-request-id': requestId,
    })

    expect(
      validateMercadoPagoHMACDetailed(headers, body(DATA_ID), SECRET, undefined),
    ).toEqual({ valid: true, reason: 'OK' })
  })
})
