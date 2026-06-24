/**
 * Testes unitários — MercadoPagoGateway.createSubscription (task 005)
 *
 * Contrato (redirect-based, PCI-DSS): cria `preapproval_plan` (idempotente) + `preapproval`
 * em modo redirect (sem card_token_id) e devolve `redirectUrl` (init_point),
 * `gatewaySubscriptionId` (preapproval.id), `gatewayPlanId` e `status`.
 * Ids de plano via config (MERCADO_PAGO_PREAPPROVAL_PLAN_IDS) OU criação idempotente via API.
 * 5xx/timeout → GatewayRetryableError (retry); 4xx → GatewayError terminal 422.
 */

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

import { MercadoPagoGateway } from '@/lib/gateways/mercadopago'
import type { GatewaySubscriptionInput } from '@/lib/gateways/IGateway'

const gateway = new MercadoPagoGateway()

function baseInput(over: Partial<GatewaySubscriptionInput> = {}): GatewaySubscriptionInput {
  return {
    planType:       'LENDA' as GatewaySubscriptionInput['planType'],
    period:         'monthly',
    amount:         2990,
    currency:       'BRL',
    subscriptionId: 'sub_internal_1',
    userId:         'user_1',
    userEmail:      'pagador@example.test',
    successUrl:     'https://example.test/planos/sucesso',
    failureUrl:     'https://example.test/planos?payment=failed',
    pendingUrl:     'https://example.test/planos?payment=pending',
    ...over,
  }
}

function jsonResponse(body: Record<string, unknown>, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body) }
}

/** Roteia o fetch por URL: /preapproval_plan vs /preapproval. */
function routeFetch(handlers: {
  plan?: () => unknown
  preapproval?: () => unknown
}) {
  ;(global.fetch as jest.Mock) = jest.fn((url: string) => {
    if (String(url).includes('/preapproval_plan')) {
      return Promise.resolve(handlers.plan ? handlers.plan() : jsonResponse({ id: 'plan_created_1' }))
    }
    return Promise.resolve(
      handlers.preapproval
        ? handlers.preapproval()
        : jsonResponse({ id: 'preapp_1', init_point: 'https://mp/auth/preapp_1', status: 'pending' }),
    )
  })
}

beforeEach(() => {
  mockEnv.MERCADO_PAGO_ACCESS_TOKEN = 'test-token'
  mockEnv.MERCADO_PAGO_PREAPPROVAL_PLAN_IDS = undefined
  ;(global.fetch as jest.Mock) = jest.fn()
})

describe('createSubscription — caminho feliz (redirect, sem card_token_id)', () => {
  it('cria plano idempotente + preapproval e retorna ids/redirect/status', async () => {
    routeFetch({})
    const res = await gateway.createSubscription(baseInput())

    expect(res.gatewaySubscriptionId).toBe('preapp_1')
    expect(res.gatewayPlanId).toBe('plan_created_1')
    expect(res.redirectUrl).toBe('https://mp/auth/preapp_1')
    expect(res.status).toBe('pending')

    // PCI-DSS: nenhuma chamada deve carregar card_token_id.
    const calls = (global.fetch as jest.Mock).mock.calls
    for (const [, init] of calls) {
      expect(String(init?.body ?? '')).not.toContain('card_token_id')
    }
  })

  it('usa preapproval_plan_id de config quando a planKey está presente (sem criar plano)', async () => {
    mockEnv.MERCADO_PAGO_PREAPPROVAL_PLAN_IDS = JSON.stringify({ LENDA_monthly: 'plan_cfg_99' })
    routeFetch({
      plan: () => {
        throw new Error('não deveria criar plano quando config tem a planKey')
      },
    })
    const res = await gateway.createSubscription(baseInput())
    expect(res.gatewayPlanId).toBe('plan_cfg_99')
    // Apenas a chamada de /preapproval deve ter ocorrido.
    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls.every(([u]) => String(u).includes('/preapproval'))).toBe(true)
    expect(calls.some(([u]) => String(u).includes('/preapproval_plan'))).toBe(false)
  })

  it('envia external_reference = subscriptionId e X-Idempotency-Key no preapproval', async () => {
    routeFetch({})
    await gateway.createSubscription(baseInput({ subscriptionId: 'sub_xyz' }))
    const preappCall = (global.fetch as jest.Mock).mock.calls.find(([u]) =>
      String(u).endsWith('/preapproval'),
    )
    expect(preappCall).toBeDefined()
    const [, init] = preappCall!
    expect(JSON.parse(init.body).external_reference).toBe('sub_xyz')
    expect(init.headers['X-Idempotency-Key']).toBe('preapproval-sub_xyz')
  })
})

describe('createSubscription — validações de input (terminal 422)', () => {
  it('amount inválido → PAYMENT_020', async () => {
    await expect(gateway.createSubscription(baseInput({ amount: 0 }))).rejects.toMatchObject({
      code: 'PAYMENT_020',
    })
  })

  it('payer_email ausente → PAYMENT_059', async () => {
    await expect(gateway.createSubscription(baseInput({ userEmail: '' }))).rejects.toMatchObject({
      code: 'PAYMENT_059',
    })
  })

  it('token ausente → PAYMENT_010', async () => {
    mockEnv.MERCADO_PAGO_ACCESS_TOKEN = undefined
    await expect(gateway.createSubscription(baseInput())).rejects.toMatchObject({
      code: 'PAYMENT_010',
    })
  })
})

describe('createSubscription — política de erros do gateway', () => {
  it('4xx no preapproval → GatewayError terminal 422 (não retentado)', async () => {
    routeFetch({
      preapproval: () => jsonResponse({ message: 'invalid' }, false, 400),
    })
    await expect(gateway.createSubscription(baseInput())).rejects.toMatchObject({
      code: 'PAYMENT_059',
      statusCode: 422,
    })
    // 1 chamada de plano + 1 de preapproval (sem retry no 4xx).
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(2)
  })

  it('5xx persistente → GatewayRetryableError após 3 tentativas', async () => {
    // Plano cria OK; preapproval sempre 503.
    ;(global.fetch as jest.Mock) = jest.fn((url: string) => {
      if (String(url).includes('/preapproval_plan')) {
        return Promise.resolve(jsonResponse({ id: 'plan_created_1' }))
      }
      return Promise.resolve(jsonResponse({ message: 'down' }, false, 503))
    })
    await expect(gateway.createSubscription(baseInput())).rejects.toMatchObject({
      name: 'GatewayRetryableError',
    })
    const preappCalls = (global.fetch as jest.Mock).mock.calls.filter(([u]) =>
      String(u).endsWith('/preapproval'),
    )
    expect(preappCalls.length).toBe(3)
  }, 10_000)
})

// ─── cancelAutoRenewal / reactivateAutoRenewal (task 006) ──────────────────────
// Mecanismo: PUT /preapproval/{id} com status 'paused' (cancel) / 'authorized' (reactivate).
// 'paused' é reversível (contrato exige reactivate restaurar a mesma assinatura).

/** Roteia o fetch do endpoint PUT /preapproval/{id}. */
function routePreapprovalPut(handler: () => unknown) {
  ;(global.fetch as jest.Mock) = jest.fn(() => Promise.resolve(handler()))
}

describe('cancelAutoRenewal — pausa o preapproval (reversível)', () => {
  it('faz PUT /preapproval/{id} com status=paused e confirma', async () => {
    routePreapprovalPut(() => jsonResponse({ id: 'preapp_1', status: 'paused' }))
    await expect(gateway.cancelAutoRenewal('preapp_1')).resolves.toBeUndefined()
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(String(url)).toBe('https://api.mercadopago.com/preapproval/preapp_1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ status: 'paused' })
  })

  it('gatewaySubscriptionId vazio → GatewayError 422 (sem chamar fetch)', async () => {
    ;(global.fetch as jest.Mock) = jest.fn()
    await expect(gateway.cancelAutoRenewal('')).rejects.toMatchObject({ statusCode: 422 })
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(0)
  })

  it('404 do MP → GatewayError PAYMENT_080 404', async () => {
    routePreapprovalPut(() => jsonResponse({ message: 'not found' }, false, 404))
    await expect(gateway.cancelAutoRenewal('missing')).rejects.toMatchObject({
      code: 'PAYMENT_080',
      statusCode: 404,
    })
  })

  it('4xx não-404 → GatewayError terminal 422 (sem retry)', async () => {
    routePreapprovalPut(() => jsonResponse({ message: 'invalid' }, false, 400))
    await expect(gateway.cancelAutoRenewal('preapp_1')).rejects.toMatchObject({ statusCode: 422 })
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1)
  })

  it('status inesperado na resposta → GatewayError 422', async () => {
    routePreapprovalPut(() => jsonResponse({ id: 'preapp_1', status: 'authorized' }))
    await expect(gateway.cancelAutoRenewal('preapp_1')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('5xx persistente → GatewayRetryableError após 3 tentativas', async () => {
    routePreapprovalPut(() => jsonResponse({ message: 'down' }, false, 503))
    await expect(gateway.cancelAutoRenewal('preapp_1')).rejects.toMatchObject({
      name: 'GatewayRetryableError',
    })
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(3)
  }, 10_000)

  it('access token ausente → GatewayError PAYMENT_010 500', async () => {
    mockEnv.MERCADO_PAGO_ACCESS_TOKEN = undefined
    ;(global.fetch as jest.Mock) = jest.fn()
    await expect(gateway.cancelAutoRenewal('preapp_1')).rejects.toMatchObject({
      code: 'PAYMENT_010',
      statusCode: 500,
    })
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(0)
  })
})

describe('reactivateAutoRenewal — retoma o preapproval', () => {
  it('faz PUT /preapproval/{id} com status=authorized e confirma', async () => {
    routePreapprovalPut(() => jsonResponse({ id: 'preapp_1', status: 'authorized' }))
    await expect(gateway.reactivateAutoRenewal('preapp_1')).resolves.toBeUndefined()
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(String(url)).toBe('https://api.mercadopago.com/preapproval/preapp_1')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body)).toEqual({ status: 'authorized' })
  })

  it('gatewaySubscriptionId vazio → GatewayError 422 (sem chamar fetch)', async () => {
    ;(global.fetch as jest.Mock) = jest.fn()
    await expect(gateway.reactivateAutoRenewal('')).rejects.toMatchObject({ statusCode: 422 })
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(0)
  })
})
