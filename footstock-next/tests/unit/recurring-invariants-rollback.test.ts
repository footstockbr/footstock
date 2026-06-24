/**
 * Suite de invariantes + rollback drill — recorrência real de assinatura
 * (loop 06-24-footstock-recorrencia-real-gateways, Task 009).
 *
 * Fecha a lacuna do apêndice E do source: "nenhum teste automatizado cobre recorrência real
 * hoje". Prova, contra as unidades REAIS de produção (sem rede, prisma/redis/gateway mockados),
 * os invariantes consolidados na seção F do source e o gate sandbox-antes-de-produção:
 *
 *  - INV-1 (não-dupla-cobrança): o DunningService gateia a recobrança por `billingMode` persistido;
 *    assinatura `recurring` (auto-débito no gateway) é excluída por construção da varredura.
 *  - INV-2 (idempotência de ciclo): o parser de webhook produz um `transactionId` estável por
 *    evento, de modo que uma reentrega duplicada faça o `Payment.upsert` deduplicar.
 *  - INV-3 (webhook fail-safe): ciclo/estado indeterminado vira `GatewayRetryableError` (route 5xx,
 *    o MP reentrega), NUNCA um 200 silencioso que perderia o ciclo.
 *  - Verificação de assinatura: HMAC adulterado é rejeitado antes de processar o evento.
 *  - Reconciliação por polling: divergência real é corrigida (CAS); status indeterminado ou fora
 *    do mapa NUNCA transiciona o espelho local (Zero Assumido).
 *  - Rollback drill: ligar/desligar o flag `recurring_enabled` é leitura pura (default OFF, INV-4),
 *    nunca muta uma Subscription; e — invariante-chave do rollback — o gate de dunning é o
 *    `billingMode` persistido, não o flag em runtime, então desligar o flag não reintroduz dupla
 *    cobrança nas assinaturas recorrentes já existentes.
 */

// ─── Mocks compartilhados ───────────────────────────────────────────────────

const mockEnv: Record<string, string | undefined> = {
  MERCADO_PAGO_ACCESS_TOKEN: 'test-token',
  NEXT_PUBLIC_APP_URL: 'https://example.test',
  MERCADO_PAGO_PREAPPROVAL_PLAN_IDS: undefined,
}
jest.mock('@/lib/env', () => ({
  get env() {
    return mockEnv
  },
}))

// Nomes prefixados com `mock` (exigência do babel-plugin-jest-hoist) e referenciados
// via forwarding lazy dentro das factories — o leaf só lê o jest.fn() quando o código de
// produção o invoca (em runtime, bem depois da inicialização dos consts), evitando a TDZ.
const mockSubFindMany = jest.fn()
const mockSubUpdateMany = jest.fn()
const mockSubUpdate = jest.fn()
const mockDunningCreate = jest.fn()
const mockDunningUpdateMany = jest.fn()
const mockUserFindUnique = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findMany: (...a: unknown[]) => mockSubFindMany(...a),
      updateMany: (...a: unknown[]) => mockSubUpdateMany(...a),
      update: (...a: unknown[]) => mockSubUpdate(...a),
    },
    dunningAttempt: {
      create: (...a: unknown[]) => mockDunningCreate(...a),
      updateMany: (...a: unknown[]) => mockDunningUpdateMany(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => mockUserFindUnique(...a),
    },
  },
}))

// Gateway único que serve tanto o DunningService (createCheckout) quanto o
// SubscriptionReconcileService (getSubscriptionStatus, via narrow-cast).
const mockCreateCheckout = jest.fn()
const mockGetSubscriptionStatus = jest.fn()
jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGateway: () => ({
    createCheckout: (...a: unknown[]) => mockCreateCheckout(...a),
    getSubscriptionStatus: (...a: unknown[]) => mockGetSubscriptionStatus(...a),
  }),
}))

const mockNotify = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: (...a: unknown[]) => mockNotify(...a) },
}))

const mockRedisGet = jest.fn()
jest.mock('@/lib/redis', () => ({
  redisPublisher: { get: (...a: unknown[]) => mockRedisGet(...a) },
}))

import { createHmac } from 'crypto'
import { DunningService } from '@/lib/services/DunningService'
import { SubscriptionReconcileService } from '@/lib/services/SubscriptionReconcileService'
import { isRecurringEnabled } from '@/lib/gateways/recurring-flag'
import { MercadoPagoGateway } from '@/lib/gateways/mercadopago'
import { GatewayRetryableError } from '@/lib/gateways/IGateway'
import { validateMercadoPagoHMACDetailed } from '@/lib/gateways/webhook-validator'

// ─── Helpers ────────────────────────────────────────────────────────────────

function jsonResp(body: Record<string, unknown>, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) }
}

/** Roteia o global.fetch por URL para os endpoints de enriquecimento de assinatura do MP. */
function routeFetch(routes: {
  authorizedPayment?: () => unknown
  preapproval?: () => unknown
}) {
  ;(global.fetch as jest.Mock) = jest.fn((url: string) => {
    const u = String(url)
    if (u.includes('/authorized_payments/')) {
      return Promise.resolve(routes.authorizedPayment ? routes.authorizedPayment() : jsonResp({}, false, 404))
    }
    if (u.includes('/preapproval/')) {
      return Promise.resolve(routes.preapproval ? routes.preapproval() : jsonResp({}, false, 404))
    }
    return Promise.resolve(jsonResp({}, false, 404))
  })
}

const subAuthorizedPayload = (dataId: string) =>
  JSON.stringify({ type: 'subscription_authorized_payment', data: { id: dataId } })
const subPreapprovalPayload = (dataId: string) =>
  JSON.stringify({ type: 'subscription_preapproval', data: { id: dataId } })

/** Subscription one_time EXPIRED já no dia da primeira tentativa de dunning (D+1). */
function oneTimeExpiredSub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_one_time_1',
    userId: 'user_1',
    planType: 'CRAQUE',
    gateway: 'MERCADO_PAGO',
    amount: 2990,
    period: 'MONTHLY',
    status: 'EXPIRED',
    expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 dias atrás (>= D+1)
    dunningAttempts: [],
    ...over,
  }
}

function recurringSub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_recurring_1',
    status: 'ACTIVE',
    gatewayStatus: 'authorized',
    gatewaySubscriptionId: 'pre_1',
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  // Default seguro: qualquer fetch não-roteado falha (nunca rede real).
  ;(global.fetch as jest.Mock) = jest.fn().mockResolvedValue(jsonResp({}, false, 404))
})

// ─── INV-1: dono único da cobrança (não-dupla-cobrança) ─────────────────────

describe('INV-1 — DunningService nunca recobra assinatura recorrente', () => {
  it('a varredura de dunning filtra billingMode=one_time (recurring excluído por construção)', async () => {
    mockSubFindMany.mockResolvedValue([])
    await new DunningService().processDunning()

    const where = (mockSubFindMany.mock.calls[0][0] as { where: { billingMode: string } }).where
    expect(where.billingMode).toBe('one_time')
  })

  it('uma assinatura one_time EXPIRED no dia da tentativa gera cobrança de dunning (o gate é só billingMode)', async () => {
    mockSubFindMany.mockResolvedValue([oneTimeExpiredSub()])
    mockSubUpdateMany.mockResolvedValue({ count: 1 })
    mockUserFindUnique.mockResolvedValue({ email: 'pagador@example.test' })
    mockCreateCheckout.mockResolvedValue({ redirectUrl: 'https://pay.test/x' })

    const res = await new DunningService().processDunning()

    expect(mockDunningCreate).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(res.processed).toBe(1)
  })
})

// ─── INV-2: idempotência de ciclo (transactionId estável para dedup) ────────

describe('INV-2 — idempotência de ciclo: transactionId estável deduplica reentregas', () => {
  const gw = new MercadoPagoGateway()

  it('preapproval cancelado entregue 2x produz o MESMO transactionId (Payment.upsert deduplica)', async () => {
    routeFetch({ preapproval: () => jsonResp({ status: 'cancelled', external_reference: 'sub_1' }) })

    const a = await gw.parseWebhookEvent(subPreapprovalPayload('pre_42'))
    const b = await gw.parseWebhookEvent(subPreapprovalPayload('pre_42'))

    expect(a.eventType).toBe('SUBSCRIPTION_CANCELLED')
    expect(a.transactionId).toBe('preapproval-cancel-pre_42')
    expect(b.transactionId).toBe(a.transactionId)
  })

  it('cobrança de ciclo aprovada usa o paymentId real como transactionId (único por ciclo)', async () => {
    routeFetch({
      authorizedPayment: () =>
        jsonResp({
          payment: { id: 9001, status: 'approved', live_mode: true },
          external_reference: 'sub_1',
          transaction_amount: 29.9,
        }),
    })

    const ev = await gw.parseWebhookEvent(subAuthorizedPayload('ap_1'))

    expect(ev.eventType).toBe('SUBSCRIPTION_RENEWED')
    expect(ev.transactionId).toBe('9001')
    expect(ev.subscriptionId).toBe('sub_1')
  })
})

// ─── INV-3: webhook fail-safe (indeterminado → retryable, nunca 200) ────────

describe('INV-3 — webhook fail-safe: indeterminado vira retryable (5xx), nunca 200', () => {
  const gw = new MercadoPagoGateway()

  it('ciclo ainda pendente (payment.status=in_process) → GatewayRetryableError', async () => {
    routeFetch({
      authorizedPayment: () =>
        jsonResp({ payment: { status: 'in_process', live_mode: true }, external_reference: 'sub_1' }),
    })
    await expect(gw.parseWebhookEvent(subAuthorizedPayload('ap_2'))).rejects.toBeInstanceOf(GatewayRetryableError)
  })

  it('cobrança sem dono (sem external_reference nem preapproval) → GatewayRetryableError', async () => {
    routeFetch({
      authorizedPayment: () => jsonResp({ payment: { status: 'approved', live_mode: true } }),
    })
    await expect(gw.parseWebhookEvent(subAuthorizedPayload('ap_3'))).rejects.toBeInstanceOf(GatewayRetryableError)
  })

  it('enriquecimento indisponível (HTTP 404) → GatewayRetryableError (provedor reentrega)', async () => {
    routeFetch({ authorizedPayment: () => jsonResp({}, false, 404) })
    await expect(gw.parseWebhookEvent(subAuthorizedPayload('ap_4'))).rejects.toBeInstanceOf(GatewayRetryableError)
  })

  it('ciclo aprovado (caminho feliz) confirma — o fail-safe não bloqueia o sucesso', async () => {
    routeFetch({
      authorizedPayment: () =>
        jsonResp({
          payment: { id: 9002, status: 'approved', live_mode: true },
          external_reference: 'sub_1',
          transaction_amount: 29.9,
        }),
    })
    const ev = await gw.parseWebhookEvent(subAuthorizedPayload('ap_5'))
    expect(ev.eventType).toBe('SUBSCRIPTION_RENEWED')
  })
})

// ─── Verificação de assinatura (HMAC obrigatório) ───────────────────────────

describe('Verificação de assinatura — HMAC rejeita evento adulterado', () => {
  const SECRET = 'unit-test-secret'
  const DATA_ID = '164446423886'
  const REQUEST_ID = 'req-uuid-abc-123'

  function hmac(manifest: string) {
    return createHmac('sha256', SECRET).update(manifest).digest('hex')
  }
  function body(dataId = DATA_ID) {
    return JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: dataId } })
  }

  it('assinatura válida (manifesto canônico id;request-id;ts) é aceita', () => {
    const ts = Math.floor(Date.now() / 1000).toString()
    const v1 = hmac(`id:${DATA_ID};request-id:${REQUEST_ID};ts:${ts};`)
    const headers = new Headers({ 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': REQUEST_ID })

    expect(validateMercadoPagoHMACDetailed(headers, body(), SECRET)).toEqual({ valid: true, reason: 'OK' })
  })

  it('payload adulterado (data.id trocado) com assinatura do payload original é rejeitado', () => {
    const ts = Math.floor(Date.now() / 1000).toString()
    // assinatura computada para o data.id legítimo...
    const v1 = hmac(`id:${DATA_ID};request-id:${REQUEST_ID};ts:${ts};`)
    const headers = new Headers({ 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': REQUEST_ID })

    // ...mas o corpo entregue traz outro data.id (forjado) → manifesto não bate.
    const result = validateMercadoPagoHMACDetailed(headers, body('999999999'), SECRET)
    expect(result.valid).toBe(false)
  })
})

// ─── Reconciliação por polling ──────────────────────────────────────────────

describe('Reconciliação por polling — corrige divergência, indeterminado nunca transiciona', () => {
  it('a varredura filtra billingMode=recurring + gateway=MERCADO_PAGO', async () => {
    mockSubFindMany.mockResolvedValue([])
    await new SubscriptionReconcileService().reconcile()

    const where = (mockSubFindMany.mock.calls[0][0] as {
      where: { billingMode: string; gateway: string }
    }).where
    expect(where.billingMode).toBe('recurring')
    expect(where.gateway).toBe('MERCADO_PAGO')
  })

  it('status divergente real (authorized→cancelled) é reconciliado via CAS', async () => {
    mockSubFindMany.mockResolvedValue([recurringSub({ status: 'ACTIVE' })])
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'cancelled' })
    mockSubUpdateMany.mockResolvedValue({ count: 1 })

    const res = await new SubscriptionReconcileService().reconcile()

    expect(mockSubUpdateMany).toHaveBeenCalledTimes(1)
    expect(res.details[0].action).toBe('RECONCILED_ACTIVE_TO_CANCELLED')
    expect(res.processed).toBe(1)
  })

  it('status indeterminado (null) nunca toca o espelho local (INV-3 em profundidade)', async () => {
    mockSubFindMany.mockResolvedValue([recurringSub()])
    mockGetSubscriptionStatus.mockResolvedValue({ status: null })

    const res = await new SubscriptionReconcileService().reconcile()

    expect(mockSubUpdateMany).not.toHaveBeenCalled()
    expect(mockSubUpdate).not.toHaveBeenCalled()
    expect(res.details[0].action).toBe('SKIP_NO_GATEWAY_STATUS')
    expect(res.processed).toBe(0)
  })

  it('status bruto fora do mapa é ignorado (Zero Assumido), nunca infere transição', async () => {
    mockSubFindMany.mockResolvedValue([recurringSub()])
    mockGetSubscriptionStatus.mockResolvedValue({ status: 'some_unknown_status' })

    const res = await new SubscriptionReconcileService().reconcile()

    expect(mockSubUpdateMany).not.toHaveBeenCalled()
    expect(res.details[0].action).toBe('SKIP_UNMAPPED_some_unknown_status')
    expect(res.processed).toBe(0)
  })

  it('falha transitória do gateway (retryable) isola a assinatura, sem mutar o espelho', async () => {
    mockSubFindMany.mockResolvedValue([recurringSub()])
    mockGetSubscriptionStatus.mockRejectedValue(new GatewayRetryableError('5xx do MP'))

    const res = await new SubscriptionReconcileService().reconcile()

    expect(mockSubUpdateMany).not.toHaveBeenCalled()
    expect(res.errors).toBe(1)
    expect(res.processed).toBe(0)
  })
})

// ─── Rollback drill (flag ON/OFF sem deixar subscription inválida, INV-4) ───

describe('Rollback drill — flag recurring_enabled ON/OFF nunca deixa subscription inválida (INV-4)', () => {
  it('default OFF: chave Redis ausente → false', async () => {
    mockRedisGet.mockResolvedValue(null)
    expect(await isRecurringEnabled('MERCADO_PAGO')).toBe(false)
  })

  it('degradação segura: erro de I/O do Redis → false', async () => {
    mockRedisGet.mockRejectedValue(new Error('redis down'))
    expect(await isRecurringEnabled('MERCADO_PAGO')).toBe(false)
  })

  it('JSON malformado no blob de config → false', async () => {
    mockRedisGet.mockResolvedValue('{not valid json')
    expect(await isRecurringEnabled('MERCADO_PAGO')).toBe(false)
  })

  it('liga somente com recurringEnabled === true explícito', async () => {
    mockRedisGet.mockResolvedValue(
      JSON.stringify({ gateways: [{ code: 'MERCADO_PAGO', recurringEnabled: true }] }),
    )
    expect(await isRecurringEnabled('MERCADO_PAGO')).toBe(true)
  })

  it('toggle ON→OFF é leitura pura: nenhuma escrita em Subscription durante o drill', async () => {
    mockRedisGet
      .mockResolvedValueOnce(JSON.stringify({ gateways: [{ code: 'MERCADO_PAGO', recurringEnabled: true }] }))
      .mockResolvedValueOnce(JSON.stringify({ gateways: [{ code: 'MERCADO_PAGO', recurringEnabled: false }] }))

    expect(await isRecurringEnabled('MERCADO_PAGO')).toBe(true) // liga
    expect(await isRecurringEnabled('MERCADO_PAGO')).toBe(false) // desliga

    expect(mockSubUpdate).not.toHaveBeenCalled()
    expect(mockSubUpdateMany).not.toHaveBeenCalled()
  })

  it('invariante-chave do rollback: o gate de dunning é o billingMode persistido, NÃO o flag em runtime', async () => {
    // Com o flag OFF (rollback), uma assinatura recurring já existente continua excluída do
    // dunning porque a varredura gateia por billingMode='one_time' (persistido no banco),
    // independente do estado do flag. Logo, desligar o flag não reintroduz dupla cobrança.
    mockRedisGet.mockResolvedValue(
      JSON.stringify({ gateways: [{ code: 'MERCADO_PAGO', recurringEnabled: false }] }),
    )
    expect(await isRecurringEnabled('MERCADO_PAGO')).toBe(false)

    mockSubFindMany.mockResolvedValue([])
    await new DunningService().processDunning()

    const where = (mockSubFindMany.mock.calls[0][0] as { where: { billingMode: string } }).where
    expect(where.billingMode).toBe('one_time')
  })
})
