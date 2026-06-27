/**
 * Testes unitários — MercadoPagoGateway.createSubscription (task 005)
 *
 * Contrato (redirect-based, PCI-DSS, planless): cria `preapproval` em modo redirect com
 * `auto_recurring` inline (sem card_token_id, sem preapproval_plan_id) e devolve `redirectUrl`
 * (init_point), `gatewaySubscriptionId` (preapproval.id), `gatewayPlanId` (null no planless)
 * e `status`. Sem plano associado: nenhum `preapproval_plan` é criado/resolvido.
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

describe('createSubscription — caminho feliz (redirect planless, sem card_token_id)', () => {
  it('planless: cria só preapproval e retorna gatewayPlanId null + ids/redirect/status', async () => {
    routeFetch({})
    const res = await gateway.createSubscription(baseInput())

    expect(res.gatewaySubscriptionId).toBe('preapp_1')
    // Planless = sem plano associado: gatewayPlanId permanece null (contrato task 003).
    expect(res.gatewayPlanId).toBeNull()
    expect(res.redirectUrl).toBe('https://mp/auth/preapp_1')
    expect(res.status).toBe('pending')

    // PCI-DSS: nenhuma chamada deve carregar card_token_id.
    const calls = (global.fetch as jest.Mock).mock.calls
    for (const [, init] of calls) {
      expect(String(init?.body ?? '')).not.toContain('card_token_id')
    }
  })

  it('planless: NÃO cria nem resolve preapproval_plan (zero chamadas a /preapproval_plan)', async () => {
    routeFetch({})
    await gateway.createSubscription(baseInput())

    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls.some(([u]) => String(u).includes('/preapproval_plan'))).toBe(false)
    // Apenas o POST /preapproval (sem plano associado) é emitido.
    expect(calls.every(([u]) => String(u).endsWith('/preapproval'))).toBe(true)
  })

  it('planless: ignora MERCADO_PAGO_PREAPPROVAL_PLAN_IDS e não chama /preapproval_plan', async () => {
    // Mesmo com config de plano presente, o caminho planless não cria/vincula plano.
    mockEnv.MERCADO_PAGO_PREAPPROVAL_PLAN_IDS = JSON.stringify({ LENDA_monthly: 'plan_cfg_99' })
    routeFetch({
      plan: () => {
        throw new Error('planless não deve tocar /preapproval_plan')
      },
    })
    const res = await gateway.createSubscription(baseInput())
    expect(res.gatewayPlanId).toBeNull()
    const calls = (global.fetch as jest.Mock).mock.calls
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
    // Planless: só a chamada de /preapproval (sem plano), e sem retry no 4xx.
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(1)
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

// ─── contrato planless redirect (task 002 — RED contra o código atual) ─────────
// Hipótese do bug (source.md L92/153/163/294 + doc oficial MP no-associated-plan/pending):
// createSubscription envia `preapproval_plan_id` no corpo de POST /preapproval, misturando
// o modo "com plano associado" com o fluxo redirect/pending. O contrato correto para o
// redirect sem plano exige `auto_recurring` INLINE e PROÍBE `preapproval_plan_id`
// (e `card_token_id`, que dispara 422 "card_token_id is required" no /checkout).
// Este bloco prova o bug: é VERMELHO contra o código atual (envia preapproval_plan_id,
// não envia auto_recurring) e fica verde após o fix do item 003.

/** Extrai o POST /preapproval (e não /preapproval_plan) das chamadas mockadas. */
function findPreapprovalPost(): { url: string; init: RequestInit } {
  const calls = (global.fetch as jest.Mock).mock.calls
  const hit = calls.find(
    ([u, init]) =>
      String(u).endsWith('/preapproval') &&
      (init as RequestInit | undefined)?.method === 'POST',
  )
  if (!hit) throw new Error('POST /preapproval não foi chamado')
  return { url: String(hit[0]), init: hit[1] as RequestInit }
}

describe('createSubscription — contrato planless redirect (RED: bug preapproval_plan_id)', () => {
  it('POST /preapproval NÃO deve conter preapproval_plan_id nem card_token_id', async () => {
    routeFetch({})
    await gateway.createSubscription(baseInput())

    const { init } = findPreapprovalPost()
    const body = JSON.parse(String(init.body))

    // Gatilho do bug (presença = vermelho contra o código atual):
    expect(body).not.toHaveProperty('preapproval_plan_id')
    // Proibido no caminho redirect (presença → 422 card_token_id is required):
    expect(body).not.toHaveProperty('card_token_id')
  })

  it('POST /preapproval deve carregar auto_recurring inline + campos obrigatórios do redirect', async () => {
    routeFetch({})
    await gateway.createSubscription(baseInput({ subscriptionId: 'sub_planless_1' }))

    const { init } = findPreapprovalPost()
    const body = JSON.parse(String(init.body))

    // auto_recurring inline substitui o plano associado (ausente no código atual = vermelho):
    expect(body).toHaveProperty('auto_recurring')
    expect(body.auto_recurring).toMatchObject({
      frequency:      1,
      frequency_type: 'months',
      currency_id:    'BRL',
    })
    expect(typeof body.auto_recurring.transaction_amount).toBe('number')

    // Campos obrigatórios do contrato redirect/pending:
    expect(body.reason).toEqual(expect.any(String))
    expect(body.back_url).toBe('https://example.test/planos/sucesso')
    expect(body.external_reference).toBe('sub_planless_1')
    expect(body.payer_email).toBe('pagador@example.test')
    expect(body.status).toBe('pending')
  })

  it('payload sanitizado + rede mockada: nenhuma chamada real ao gateway', async () => {
    routeFetch({})
    await gateway.createSubscription(baseInput())

    // Todas as chamadas passaram pelo mock (zero rede real):
    expect(jest.isMockFunction(global.fetch)).toBe(true)
    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const [url, init] of calls) {
      // Só hosts MP mockados; nenhum token/secret real no corpo.
      expect(String(url)).toMatch(/^https:\/\/api\.mercadopago\.com\//)
      const raw = String((init as RequestInit | undefined)?.body ?? '')
      expect(raw).not.toContain('card_token_id')
      // Placeholders, não credenciais reais (sem prefixos de token MP):
      expect(raw).not.toMatch(/APP_USR-|APP-USR|TEST-\d{6,}/)
    }
  })
})
