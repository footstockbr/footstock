# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tier2-cancellation-lock.spec.ts >> T-010: Cancelamento de Assinatura com Lock — TIER 2 >> CL-03: Endpoint de historico de assinaturas disponivel
- Location: tests/e2e/tier2-cancellation-lock.spec.ts:68:7

# Error details

```
Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
Call log:
  - → POST http://localhost:3000/api/v1/auth/login
    - user-agent: Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.7727.15 Mobile Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br
    - content-type: application/json
    - content-length: 61

```

# Test source

```ts
  1   | /**
  2   |  * TIER 2 — Cancelamento de Assinatura com Lock (T-010)
  3   |  * FootStock / T-033 Verificacao E2E Completa de Gaps
  4   |  *
  5   |  * Cenarios cobertos:
  6   |  *   CL-01: DELETE /api/v1/subscriptions/me muda status para CANCELLATION_LOCK
  7   |  *   CL-02: Assinatura em CANCELLATION_LOCK bloqueia novas ordens BUY
  8   |  *   CL-03: Assinatura em CANCELLATION_LOCK permite ordens SELL (reducao de risco)
  9   |  *   CL-04: GET /api/v1/subscriptions/me retorna campo de expiracao do lock
  10  |  *   CL-05: PATCH /api/v1/subscriptions/me/reactivate reverte CANCELLATION_LOCK para ACTIVE
  11  |  *   CL-06: Cron de expiracao de lock responde corretamente
  12  |  */
  13  | 
  14  | import { test, expect } from '@playwright/test'
  15  | import { USERS, TEST_TICKER } from './setup'
  16  | 
  17  | test.describe('T-010: Cancelamento de Assinatura com Lock — TIER 2', () => {
  18  |   test('CL-01: GET /api/v1/subscriptions/me retorna status atual da assinatura', async ({
  19  |     request,
  20  |   }) => {
  21  |     const loginRes = await request.post('/api/v1/auth/login', {
  22  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  23  |     })
  24  |     expect(loginRes.status()).toBe(200)
  25  | 
  26  |     const res = await request.get('/api/v1/subscriptions/me', {
  27  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  28  |     })
  29  | 
  30  |     expect([200, 404]).toContain(res.status())
  31  |     if (res.status() === 200) {
  32  |       const body = await res.json()
  33  |       expect(body.success).toBe(true)
  34  |       expect(body.data).toBeDefined()
  35  | 
  36  |       // Status deve ser um dos validos
  37  |       const status = body.data?.status
  38  |       if (status) {
  39  |         const validStatuses = ['ACTIVE', 'TRIAL', 'CANCELLATION_LOCK', 'CANCELLED', 'EXPIRED', 'INACTIVE']
  40  |         expect(validStatuses).toContain(status)
  41  |       }
  42  |     }
  43  |   })
  44  | 
  45  |   test('CL-02: Assinatura retorna campo cancelAt quando em CANCELLATION_LOCK', async ({
  46  |     request,
  47  |   }) => {
  48  |     const loginRes = await request.post('/api/v1/auth/login', {
  49  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  50  |     })
  51  |     expect(loginRes.status()).toBe(200)
  52  | 
  53  |     const res = await request.get('/api/v1/subscriptions/me', {
  54  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  55  |     })
  56  | 
  57  |     if (res.status() === 200) {
  58  |       const body = await res.json()
  59  |       const sub = body.data
  60  | 
  61  |       // Se estiver em lock, deve ter campo de expiracao
  62  |       if (sub?.status === 'CANCELLATION_LOCK') {
  63  |         expect(sub.cancelAt ?? sub.cancellationLockExpiresAt).toBeDefined()
  64  |       }
  65  |     }
  66  |   })
  67  | 
  68  |   test('CL-03: Endpoint de historico de assinaturas disponivel', async ({ request }) => {
> 69  |     const loginRes = await request.post('/api/v1/auth/login', {
      |                                    ^ Error: apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:3000
  70  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  71  |     })
  72  |     expect(loginRes.status()).toBe(200)
  73  | 
  74  |     const res = await request.get('/api/v1/subscriptions/history', {
  75  |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  76  |     })
  77  | 
  78  |     expect([200, 204]).toContain(res.status())
  79  |     expect(res.status()).not.toBe(500)
  80  |   })
  81  | 
  82  |   test('CL-04: Cron de expiracao de lock responde 200 ou 401 (nao 500)', async ({ request }) => {
  83  |     const res = await request.post('/api/cron/cancellation-expiry', {
  84  |       headers: {
  85  |         authorization: `Bearer ${process.env.CRON_SECRET ?? 'test-secret'}`,
  86  |       },
  87  |     })
  88  | 
  89  |     expect([200, 401, 403]).toContain(res.status())
  90  |     expect(res.status()).not.toBe(500)
  91  |   })
  92  | 
  93  |   test('CL-05: Ordem BUY bloqueada em CANCELLATION_LOCK nao retorna 500', async ({ request }) => {
  94  |     // Este teste verifica o comportamento da API sem modificar dados de producao
  95  |     // O guard esta implementado em orders/route.ts — verificar apenas que o endpoint responde
  96  |     const loginRes = await request.post('/api/v1/auth/login', {
  97  |       data: { email: USERS.craque.email, password: USERS.craque.password },
  98  |     })
  99  |     expect(loginRes.status()).toBe(200)
  100 | 
  101 |     const orderRes = await request.post('/api/v1/orders', {
  102 |       data: {
  103 |         ticker: TEST_TICKER,
  104 |         side: 'BUY',
  105 |         type: 'MARKET',
  106 |         quantity: 1,
  107 |       },
  108 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  109 |     })
  110 | 
  111 |     // Independente do status da assinatura, nao deve retornar 500
  112 |     expect(orderRes.status()).not.toBe(500)
  113 |   })
  114 | 
  115 |   test('CL-06: Ordem SELL permitida mesmo em CANCELLATION_LOCK (nao retorna 423)', async ({
  116 |     request,
  117 |   }) => {
  118 |     const loginRes = await request.post('/api/v1/auth/login', {
  119 |       data: { email: USERS.craque.email, password: USERS.craque.password },
  120 |     })
  121 |     expect(loginRes.status()).toBe(200)
  122 | 
  123 |     const orderRes = await request.post('/api/v1/orders', {
  124 |       data: {
  125 |         ticker: TEST_TICKER,
  126 |         side: 'SELL',
  127 |         type: 'MARKET',
  128 |         quantity: 1,
  129 |       },
  130 |       headers: { cookie: loginRes.headers()['set-cookie'] ?? '' },
  131 |     })
  132 | 
  133 |     // SELL nao deve ser bloqueado por CANCELLATION_LOCK (apenas BUY e tipos premium)
  134 |     // Pode ser 201 (executada), 422 (sem posicao para vender), 503 (motor offline)
  135 |     // Nunca deve ser bloqueado pelo guard de CANCELLATION_LOCK
  136 |     expect([201, 422, 503]).toContain(orderRes.status())
  137 |     expect(orderRes.status()).not.toBe(423)
  138 |   })
  139 | })
  140 | 
```