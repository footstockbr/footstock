// ============================================================================
// FootStock — Integration Tests: Payments Endpoints
// Cobre: POST /payments/checkout, POST /payments/webhook
//
// Segurança:
//   - THREAT-004: Webhook forgery — HMAC deve ser validado com crypto.timingSafeEqual
//   - Idempotência via gatewayTransactionId UNIQUE
//   - Checkout não permite assinatura duplicada (409)
// ============================================================================

import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { testPrisma, limparUsuariosDeTeste } from './setup'
import {
  createTestUser,
  createTestSubscription,
  buildTestEmail,
} from './helpers/factory.helper'
import { mockAuthAsUser, mockAuthInvalid, buildNextRequest, parseResponse } from './helpers/auth.helper'

// ─── Fronteira externa: so o gateway sai do processo ─────────────────────────
//
// `PlanService.createCheckout` termina chamando o Mercado Pago de verdade
// (`getGateway(...).createCheckout`), que exige `MERCADO_PAGO_ACCESS_TOKEN`. Sem
// token o checkout devolvia 500/PAYMENT_010 e o teste de happy path reprovava por
// falta de credencial, nao por defeito de codigo -- e com token ele bateria na API
// do MP a cada `npm run test:integration`, o que nao pode acontecer.
//
// O corte e cirurgico: `requireActual` preserva TODO o resto do modulo (o webhook
// usa `getGatewayByHeader`/`detectGatewayType` daqui e precisa deles reais) e so
// `getGateway` vira duble. Tudo que o teste quer exercitar -- auth, validacao,
// regra de plano, criacao da Subscription PENDING, forma da resposta -- continua
// sendo codigo de producao.
//
// O webhook tem uma SEGUNDA fronteira externa, independente do checkout:
// `MercadoPagoGateway.parseWebhookEvent` faz um GET ao vivo em
// `/v1/payments/{id}` para enriquecer o status. Sem token ele lanca
// `GatewayRetryableError` e a rota devolve 503 -- por isso o teste de happy path
// so conseguia afirmar `not.toBe(401)`: nunca processou nada. Aqui `parseWebhookEvent`
// e substituido POR INSTANCIA (`Object.create` sobre o gateway real), mantendo
// roteamento por header, validacao HMAC, rate limit, dedup e todo o processamento
// financeiro como codigo de producao. O evento devolvido e declarado por teste via
// `__definirEventoDeWebhook`.
jest.mock('@/lib/gateways/GatewayFactory', () => {
  const real = jest.requireActual('@/lib/gateways/GatewayFactory')
  const estado: { evento: unknown } = { evento: null }
  return {
    ...real,
    __definirEventoDeWebhook: (evento: unknown) => { estado.evento = evento },
    getGatewayByHeader: (headers: Headers) => {
      const gateway = real.getGatewayByHeader(headers)
      if (!gateway || estado.evento === null) return gateway
      const duble = Object.create(gateway)
      duble.parseWebhookEvent = async () => estado.evento
      return duble
    },
    getGateway: jest.fn(() => ({
      createCheckout: jest.fn(async () => ({
        redirectUrl: 'https://sandbox.mercadopago.com.br/checkout/integration-test',
        gatewayCheckoutId: 'pref-integration-test',
      })),
      createSubscription: jest.fn(async () => ({
        gatewaySubscriptionId: 'preapproval-integration-test',
        redirectUrl: 'https://sandbox.mercadopago.com.br/preapproval/integration-test',
        status: 'pending',
      })),
      cancelSubscriptionTerminal: jest.fn(async () => undefined),
    })),
  }
})

// ─── Setup ────────────────────────────────────────────────────────────────────

let testUser: { id: string; email: string; planType: string }

beforeEach(async () => {
  testUser = await createTestUser(testPrisma, {
    planType: 'JOGADOR',
    email: buildTestEmail('pay'),
  })
})

afterEach(async () => {
  await limparUsuariosDeTeste()
})

// ─── Cenário 1 — Happy Path: Checkout ────────────────────────────────────────

describe('POST /api/v1/payments/checkout', () => {
  it('[happy] deve iniciar checkout e retornar checkoutUrl → 200', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/payments/checkout/route').catch(() => null)
    if (!handler?.POST) return

    const req = buildNextRequest('POST', '/api/v1/payments/checkout', {
      planType: 'CRAQUE',
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
    })

    const res = await handler.POST(req as NextRequest)
    expect(res.status).toBeLessThan(300)
    const body = (await parseResponse(res)) as Record<string, unknown>
    const data = (body.data || body) as Record<string, unknown>

    // O campo e `redirectUrl` (rota: `created({ redirectUrl, subscriptionId })`).
    // A asserçao antiga aceitava `checkoutUrl || url || body.success` -- tres nomes
    // que a rota nunca devolveu; passaria com qualquer coisa truthy no corpo.
    expect(typeof data.redirectUrl).toBe('string')
    expect(data.redirectUrl as string).toMatch(/^https:\/\//)
    expect(typeof data.subscriptionId).toBe('string')

    // Efeito real do checkout: Subscription PENDING criada para o usuario.
    const sub = await testPrisma.subscription.findUnique({
      where: { id: data.subscriptionId as string },
    })
    expect(sub).toBeTruthy()
    expect(sub!.userId).toBe(testUser.id)
    expect(sub!.status).toBe('PENDING')
    expect(sub!.planType).toBe('CRAQUE')
  })

  it('[validacao] deve rejeitar planType inválido → 400/422', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/payments/checkout/route').catch(() => null)
    if (!handler?.POST) return

    const req = buildNextRequest('POST', '/api/v1/payments/checkout', {
      planType: 'INVALIDO',
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
    })

    const res = await handler.POST(req as NextRequest)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })

  it('[validacao] deve rejeitar checkout para plan JOGADOR (gratuito)', async () => {
    mockAuthAsUser(testUser.id)

    const handler = await import('@/app/api/v1/payments/checkout/route').catch(() => null)
    if (!handler?.POST) return

    const req = buildNextRequest('POST', '/api/v1/payments/checkout', {
      planType: 'JOGADOR', // Plano gratuito — não deve ter checkout
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
    })

    const res = await handler.POST(req as NextRequest)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('[validacao] assinatura duplicada deve retornar 409', async () => {
    mockAuthAsUser(testUser.id)

    // Criar assinatura existente no banco
    await createTestSubscription(testPrisma, testUser.id, 'CRAQUE')

    const handler = await import('@/app/api/v1/payments/checkout/route').catch(() => null)
    if (!handler?.POST) return

    const req = buildNextRequest('POST', '/api/v1/payments/checkout', {
      planType: 'CRAQUE',
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
    })

    const res = await handler.POST(req as NextRequest)
    // 409 = já tem assinatura ativa no mesmo plano
    expect(res.status).toBe(409)
  })

  it('[auth] deve retornar 401 sem token', async () => {
    mockAuthInvalid()

    const handler = await import('@/app/api/v1/payments/checkout/route').catch(() => null)
    if (!handler?.POST) return

    const req = buildNextRequest('POST', '/api/v1/payments/checkout', {
      planType: 'CRAQUE',
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
    })

    const res = await handler.POST(req as NextRequest)
    expect(res.status).toBe(401)
  })
})

// ─── Cenário 2 — Webhook: HMAC validation (THREAT-004) ───────────────────────

describe('POST /api/v1/payments/webhook — HMAC (THREAT-004)', () => {
  // O segredo e o MESMO que a rota le (`env.MERCADO_PAGO_WEBHOOK_SECRET`, via
  // webhook-validator). O teste antigo assinava com `WEBHOOK_SECRET_TEST`, uma env
  // que a rota nunca consulta: a assinatura "valida" era tao invalida quanto a forjada.
  const SEGREDO_MP = process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? ''

  /**
   * Assinatura no formato REAL do Mercado Pago.
   *
   * O helper antigo devolvia um digest hex nu (`crypto.createHmac(...).digest('hex')`)
   * sobre o corpo inteiro. O MP nao faz nada disso: manda `x-signature: ts=<epoch>,v1=<hmac>`
   * e o HMAC e sobre o MANIFESTO `id:{data.id};request-id:{x-request-id};ts:{ts};`, nunca
   * sobre o body. Consequencia: o digest nu nao casava o regex `v1=([a-f0-9]+)` do
   * validador e TODO webhook desta suite -- o "valido" inclusive -- morria em
   * MISSING_SIGNATURE, antes de qualquer validacao de segredo. Os testes de rejeicao
   * passavam sem nunca exercitar a comparacao timing-safe que THREAT-004 existe para
   * proteger.
   */
  function assinaturaMercadoPago(
    dataId: string,
    ts: number,
    requestId: string,
    segredo: string = SEGREDO_MP,
  ): string {
    const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`
    const v1 = crypto.createHmac('sha256', segredo).update(manifesto).digest('hex')
    return `ts=${ts},v1=${v1}`
  }

  function requisicaoDeWebhook(body: string, headers: Record<string, string>): NextRequest {
    return new Request('http://localhost/api/v1/payments/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    }) as NextRequest
  }

  async function carregarRota() {
    return import('@/app/api/v1/payments/webhook/route')
  }

  // `getGatewayByHeader` NAO olha `X-Gateway` (GatewayFactory.ts:55-71): ele roteia por
  // `x-signature` / `x-authenticity-token` / `x-pagseguro-signature` / `paypal-transmission-sig`.
  // Um `X-Gateway: mercado_pago` sozinho cai em "gateway nao reconhecido" e sai da rota antes
  // do ramo de assinatura -- era assim que o teste "sem assinatura" passava pelo motivo errado.
  // Para exercitar o ramo de assinatura e obrigatorio mandar `x-signature`, ainda que malformado.

  afterEach(async () => {
    const gf = await import('@/lib/gateways/GatewayFactory')
    ;(gf as unknown as { __definirEventoDeWebhook: (e: unknown) => void }).__definirEventoDeWebhook(null)
  })

  it('[happy] webhook com assinatura MP valida e processado e auditado ACCEPTED → 200', async () => {
    const sub = await createTestSubscription(testPrisma, testUser.id, 'CRAQUE')

    const transactionId = `1234567${Date.now() % 1000}`
    const requestId = `req-${transactionId}`
    const ts = Math.floor(Date.now() / 1000)
    const body = JSON.stringify({
      type: 'subscription_preapproval',
      action: 'updated',
      data: { id: transactionId },
    })

    const gf = await import('@/lib/gateways/GatewayFactory')
    ;(gf as unknown as { __definirEventoDeWebhook: (e: unknown) => void }).__definirEventoDeWebhook({
      eventType: 'SUBSCRIPTION_CANCELLED',
      transactionId,
      subscriptionId: sub.id,
      amount: 2990,
      gateway: 'MERCADO_PAGO',
      rawPayload: body,
    })

    const handler = await carregarRota()
    const res = await handler.POST(requisicaoDeWebhook(body, {
      'x-signature': assinaturaMercadoPago(transactionId, ts, requestId),
      'x-request-id': requestId,
    }))

    expect(res.status).toBe(200)

    // Efeito real do evento (webhook/route.ts, ramo SUBSCRIPTION_CANCELLED): a intencao
    // do gateway e refletida na assinatura. Sem isto o teste so afirmaria "nao deu 401".
    const depois = await testPrisma.subscription.findUnique({ where: { id: sub.id } })
    expect(depois!.cancelAtPeriodEnd).toBe(true)
    expect(depois!.gatewayStatus).toBe('cancelled')

    // Zero Silencio: processamento concluido grava ACCEPTED com hmacValid=true.
    const aceito = await testPrisma.webhookAuditLog.findFirst({
      where: { transactionId, status: 'ACCEPTED' },
    })
    expect(aceito).toBeTruthy()
    expect(aceito!.hmacValid).toBe(true)
  })

  // Os tres testes de rejeicao abaixo pediam status >= 400. A rota faz o OPOSTO de
  // proposito: rejeicao responde SEMPRE `200 {received:true}` -- esta escrito no
  // cabecalho do handler ("Qualquer erro retorna 200 silencioso para nao vazar
  // informacao de seguranca") e e o comportamento certo, porque um 401 confirmaria
  // ao atacante que o endpoint existe e que o segredo dele esta errado. O contrato
  // real de THREAT-004 tem duas metades: (a) nao processa e (b) nao e silencioso --
  // grava linha REJECTED com `hmacValid=false` em `webhook_audit_logs`. E isso que
  // se afere aqui. Se alguem trocar o 200 por 4xx, estes testes reprovam a mudanca.
  it('[seguranca] webhook com HMAC forjado é descartado sem processar e fica auditado (THREAT-004)', async () => {
    const sub = await createTestSubscription(testPrisma, testUser.id, 'CRAQUE')

    const transactionId = `7654321${Date.now() % 1000}`
    const requestId = `req-${transactionId}`
    const ts = Math.floor(Date.now() / 1000)
    const body = JSON.stringify({ type: 'payment', data: { id: transactionId } })

    // Evento declarado de proposito: se a validacao HMAC deixasse passar, o
    // processamento aconteceria e as asserçoes abaixo reprovariam. E essa a prova
    // de que a rejeicao veio da assinatura, e nao de o teste nao ter o que processar.
    const gf = await import('@/lib/gateways/GatewayFactory')
    ;(gf as unknown as { __definirEventoDeWebhook: (e: unknown) => void }).__definirEventoDeWebhook({
      eventType: 'SUBSCRIPTION_CANCELLED',
      transactionId,
      subscriptionId: sub.id,
      amount: 2990,
      gateway: 'MERCADO_PAGO',
      rawPayload: body,
    })

    const antes = await testPrisma.webhookAuditLog.count({ where: { status: 'REJECTED' } })

    const handler = await carregarRota()
    const res = await handler.POST(requisicaoDeWebhook(body, {
      // Formato bem-formado, segredo do atacante: chega na comparacao timing-safe e
      // reprova ali (BAD_SIGNATURE), que e o ramo que THREAT-004 protege.
      'x-signature': assinaturaMercadoPago(transactionId, ts, requestId, 'segredo-do-atacante'),
      'x-request-id': requestId,
    }))

    // 200 silencioso e o contrato — nao vaza existencia nem motivo ao chamador.
    expect(res.status).toBe(200)

    // Zero Silencio: a rejeicao existe no rastro de auditoria, com hmacValid=false.
    expect(await testPrisma.webhookAuditLog.count({ where: { status: 'REJECTED' } })).toBe(antes + 1)
    const rejeitado = await testPrisma.webhookAuditLog.findMany({
      where: { status: 'REJECTED' }, orderBy: { processedAt: 'desc' }, take: 1,
    })
    expect(rejeitado[0]!.hmacValid).toBe(false)

    // E nao processou: nem ACCEPTED, nem efeito no agregado.
    expect(await testPrisma.webhookAuditLog.findFirst({
      where: { transactionId, status: 'ACCEPTED' },
    })).toBeNull()
    const intacta = await testPrisma.subscription.findUnique({ where: { id: sub.id } })
    expect(intacta!.cancelAtPeriodEnd).toBe(false)
  })

  it('[seguranca] webhook com assinatura ausente/malformada é descartado e fica auditado (THREAT-004)', async () => {
    const sub = await createTestSubscription(testPrisma, testUser.id, 'CRAQUE')

    const transactionId = `5555555${Date.now() % 1000}`
    const body = JSON.stringify({ type: 'payment', data: { id: transactionId } })

    const gf = await import('@/lib/gateways/GatewayFactory')
    ;(gf as unknown as { __definirEventoDeWebhook: (e: unknown) => void }).__definirEventoDeWebhook({
      eventType: 'SUBSCRIPTION_CANCELLED',
      transactionId,
      subscriptionId: sub.id,
      amount: 2990,
      gateway: 'MERCADO_PAGO',
      rawPayload: body,
    })

    const antes = await testPrisma.webhookAuditLog.count({ where: { status: 'REJECTED' } })

    const handler = await carregarRota()
    // `x-signature` presente (senao a rota sai em "gateway nao reconhecido", antes do
    // ramo de assinatura) mas sem os campos `ts=`/`v1=` do formato MP: e o caminho
    // MISSING_SIGNATURE do validador.
    const res = await handler.POST(requisicaoDeWebhook(body, { 'x-signature': 'lixo-sem-ts-nem-v1' }))

    expect(res.status).toBe(200)
    expect(await testPrisma.webhookAuditLog.count({ where: { status: 'REJECTED' } })).toBe(antes + 1)
    expect(await testPrisma.webhookAuditLog.findFirst({
      where: { transactionId, status: 'ACCEPTED' },
    })).toBeNull()
    const intacta = await testPrisma.subscription.findUnique({ where: { id: sub.id } })
    expect(intacta!.cancelAtPeriodEnd).toBe(false)
  })

  it('[idempotencia] reentrega do mesmo evento vira DUPLICATE sem reprocessar → 200', async () => {
    // O teste antigo semeava `webhookAuditLog` a mao com colunas que nao existem no
    // modelo (`gatewayTransactionId`, `payload`) e sem a obrigatoria `hmacValid`, tudo
    // dentro de um `try { ... } catch { console.log('[skip]'); return }`: o create
    // estourava, o catch engolia e o teste retornava VERDE sem afirmar nada. Alem
    // disso esperava 409, que a rota nunca devolve -- duplicata e `200 {received:true}`
    // + linha DUPLICATE (webhook/route.ts §5b), porque o provedor precisa parar de
    // reenviar, nao interpretar erro. Aqui a duplicata e produzida do jeito real: o
    // MESMO webhook valido entregue duas vezes.
    const sub = await createTestSubscription(testPrisma, testUser.id, 'CRAQUE')

    const transactionId = `9999999${Date.now() % 1000}`
    const requestId = `req-${transactionId}`
    const ts = Math.floor(Date.now() / 1000)
    const body = JSON.stringify({
      type: 'subscription_preapproval',
      action: 'updated',
      data: { id: transactionId },
    })

    const gf = await import('@/lib/gateways/GatewayFactory')
    ;(gf as unknown as { __definirEventoDeWebhook: (e: unknown) => void }).__definirEventoDeWebhook({
      eventType: 'SUBSCRIPTION_CANCELLED',
      transactionId,
      subscriptionId: sub.id,
      amount: 2990,
      gateway: 'MERCADO_PAGO',
      rawPayload: body,
    })

    const handler = await carregarRota()
    const headers = {
      'x-signature': assinaturaMercadoPago(transactionId, ts, requestId),
      'x-request-id': requestId,
    }

    const primeira = await handler.POST(requisicaoDeWebhook(body, headers))
    expect(primeira.status).toBe(200)
    expect(await testPrisma.webhookAuditLog.count({
      where: { transactionId, status: 'ACCEPTED' },
    })).toBe(1)

    const segunda = await handler.POST(requisicaoDeWebhook(body, headers))
    expect(segunda.status).toBe(200)

    // A reentrega vira DUPLICATE e NAO gera um segundo ACCEPTED.
    expect(await testPrisma.webhookAuditLog.count({
      where: { transactionId, status: 'DUPLICATE' },
    })).toBe(1)
    expect(await testPrisma.webhookAuditLog.count({
      where: { transactionId, status: 'ACCEPTED' },
    })).toBe(1)
  })
})
