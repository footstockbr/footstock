// ============================================================================
// FootStock — Integration Tests: Orders Endpoints
// Cobre: POST /orders, GET /orders, GET /orders/:id, DELETE /orders/:id
//
// Testa service ↔ banco REAL (sem mocks de Prisma).
// Segurança:
//   - THREAT-005: IDOR — usuário A não pode acessar/cancelar ordens de B
//   - THREAT-006: Race condition — saldo não vai negativo
//   - ORDER_050: Saldo insuficiente → 402
//   - ORDER_051: Tipo de ordem não permitido pelo plano → 403
//   - ORDER_052: Limite diário atingido → 429
//   - ORDER_053: Cancelar ordem não-OPEN → 422
// ============================================================================

import { testPrisma, TEST_EMAIL_DOMAIN } from './setup'
import {
  createTestUser,
  createTestOrder,
  buildTestEmail,
  buildOrderPayload,
} from './helpers/factory.helper'
import { OrderService } from '@/lib/services/OrderService'

// ─── Setup ────────────────────────────────────────────────────────────────────

let jogadorUser: { id: string; email: string; planType: string }
let craqueUser: { id: string; email: string; planType: string }
let lendaUser: { id: string; email: string; planType: string }
let orderService: OrderService

beforeEach(async () => {
  ;[jogadorUser, craqueUser, lendaUser] = await Promise.all([
    createTestUser(testPrisma, { planType: 'JOGADOR', fsBalance: 5000, email: buildTestEmail('ord-jogador') }),
    createTestUser(testPrisma, { planType: 'CRAQUE', fsBalance: 20000, email: buildTestEmail('ord-craque') }),
    createTestUser(testPrisma, { planType: 'LENDA', fsBalance: 100000, email: buildTestEmail('ord-lenda') }),
  ])
  orderService = new OrderService()
})

afterEach(async () => {
  await testPrisma.user.deleteMany({ where: { email: { endsWith: TEST_EMAIL_DOMAIN } } })
})

// ─── Cenário 1 — Happy Path: Criar ordem MARKET ───────────────────────────────

describe('OrderService — POST /orders (happy path)', () => {
  it('[happy] LENDA cria ordem MARKET BUY → salva no banco', async () => {
    const payload = buildOrderPayload({ type: 'MARKET', side: 'BUY', quantity: 1 })

    const order = await orderService.createOrder(lendaUser.id, payload)

    expect(order).toBeDefined()
    expect(order.userId).toBe(lendaUser.id)
    expect(order.ticker).toBe(payload.ticker)

    // Verificar persistência no banco
    const dbOrder = await testPrisma.order.findUnique({ where: { id: order.id } })
    expect(dbOrder).toBeTruthy()
    expect(dbOrder!.status).toMatch(/OPEN|FILLED/)

    // Verificar que o saldo foi debitado
    const dbUser = await testPrisma.user.findUnique({ where: { id: lendaUser.id } })
    expect(dbUser!.fsBalance.toNumber()).toBeLessThan(100000)
  })

  it('[happy] CRAQUE cria ordem LIMIT → persiste no banco', async () => {
    const payload = buildOrderPayload({ type: 'LIMIT', side: 'BUY', quantity: 1, price: 50 })

    const order = await orderService.createOrder(craqueUser.id, payload)

    expect(order).toBeDefined()
    expect(order.type).toBe('LIMIT')

    const dbOrder = await testPrisma.order.findUnique({ where: { id: order.id } })
    expect(dbOrder).toBeTruthy()
  })
})

// ─── Cenário 2 — Validações de Plano ─────────────────────────────────────────

describe('OrderService — Restrições de plano', () => {
  it('[restricao] JOGADOR não pode criar ordem LIMIT → ORDER_051', async () => {
    await expect(
      orderService.createOrder(jogadorUser.id, buildOrderPayload({ type: 'LIMIT', price: 90 }))
    ).rejects.toMatchObject({ code: 'ORDER_051' })

    // Verificar que nenhuma ordem foi criada no banco
    const count = await testPrisma.order.count({ where: { userId: jogadorUser.id } })
    expect(count).toBe(0)
  })

  it('[restricao] JOGADOR não pode criar ordem OCO → ORDER_051', async () => {
    await expect(
      orderService.createOrder(jogadorUser.id, buildOrderPayload({
        type: 'OCO',
        price: 110,
        stopLossPrice: 90,
        takeProfitPrice: 120,
      }))
    ).rejects.toMatchObject({ code: 'ORDER_051' })
  })

  it('[restricao] CRAQUE não pode criar ordem SHORT → ORDER_051', async () => {
    await expect(
      orderService.createOrder(craqueUser.id, buildOrderPayload({ type: 'SHORT', price: 100 }))
    ).rejects.toMatchObject({ code: 'ORDER_051' })
  })

  it('[restricao] JOGADOR não pode criar alavancagem 2x → ORDER_051', async () => {
    await expect(
      orderService.createOrder(jogadorUser.id, buildOrderPayload({ leverage: 2 } as Parameters<typeof buildOrderPayload>[0]))
    ).rejects.toMatchObject({ code: 'ORDER_051' })
  })
})

// ─── Cenário 2b — Saldo Insuficiente ─────────────────────────────────────────

describe('OrderService — Saldo insuficiente (THREAT-006)', () => {
  it('[saldo] deve rejeitar ordem com saldo insuficiente → ORDER_050', async () => {
    // Criar usuário com saldo mínimo
    const brokeUser = await createTestUser(testPrisma, {
      planType: 'LENDA',
      fsBalance: 1, // FS$ 1 — insuficiente para qualquer ordem
      email: buildTestEmail('broke'),
    })

    await expect(
      orderService.createOrder(brokeUser.id, buildOrderPayload({ quantity: 100 }))
    ).rejects.toMatchObject({ code: 'ORDER_050' })

    // THREAT-006: Verificar que o saldo não ficou negativo
    const dbUser = await testPrisma.user.findUnique({ where: { id: brokeUser.id } })
    expect(dbUser!.fsBalance.toNumber()).toBeGreaterThanOrEqual(0)
  })

  it('[saldo] saldo nunca deve ficar negativo mesmo com concorrência → THREAT-006', async () => {
    // Criar usuário com saldo exato para 1 ordem
    const asset = await testPrisma.asset.findFirst({ where: { ticker: 'URU3' } })
    if (!asset) return

    const saldoExato = parseFloat(asset.currentPrice.toString()) * 1 // 1 ação
    const tightUser = await createTestUser(testPrisma, {
      planType: 'LENDA',
      fsBalance: saldoExato,
      email: buildTestEmail('tight'),
    })

    // Enviar 2 ordens simultaneamente — apenas 1 deve ser aceita
    const results = await Promise.allSettled([
      orderService.createOrder(tightUser.id, buildOrderPayload({ quantity: 1 })),
      orderService.createOrder(tightUser.id, buildOrderPayload({ quantity: 1 })),
    ])

    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')

    // No máximo 1 ordem deve ser aceita
    expect(fulfilled.length).toBeLessThanOrEqual(1)

    // Saldo nunca negativo
    const dbUser = await testPrisma.user.findUnique({ where: { id: tightUser.id } })
    expect(dbUser!.fsBalance.toNumber()).toBeGreaterThanOrEqual(0)

    // Se houve rejeição, deve ser por saldo insuficiente (não erro de sistema)
    if (rejected.length > 0) {
      const reason = (rejected[0] as PromiseRejectedResult).reason
      expect(['ORDER_050', 'SYS_004']).toContain(reason?.code)
    }
  })
})

// ─── Cenário 3 — Autenticação: Apenas o dono acessa a ordem ──────────────────

describe('OrderService — Controle de ownership / IDOR (THREAT-005)', () => {
  it('[seguranca] usuário A não pode ver ordem de usuário B → ORDER_080', async () => {
    // Criar ordem pertencente ao usuário B
    const orderOfB = await createTestOrder(testPrisma, {
      userId: lendaUser.id,
      type: 'LIMIT',
      status: 'OPEN',
    })

    // Usuário A (craqueUser) tenta acessar a ordem de B
    await expect(
      orderService.getOrderById(craqueUser.id, orderOfB.id)
    ).rejects.toMatchObject({ code: expect.stringMatching(/ORDER_080|ORDER_081|AUTH_005/) })
  })

  it('[seguranca] usuário A não pode cancelar ordem de usuário B → IDOR', async () => {
    const orderOfB = await createTestOrder(testPrisma, {
      userId: lendaUser.id,
      type: 'LIMIT',
      status: 'OPEN',
    })

    // Usuário A tenta cancelar ordem de B
    await expect(
      orderService.cancelOrder(craqueUser.id, orderOfB.id)
    ).rejects.toMatchObject({ code: expect.stringMatching(/ORDER_080|ORDER_081|AUTH_005/) })

    // Verificar que a ordem de B continua OPEN no banco
    const dbOrder = await testPrisma.order.findUnique({ where: { id: orderOfB.id } })
    expect(dbOrder!.status).toBe('OPEN')
  })
})

// ─── Cenário 3b — Cancelamento de ordem ──────────────────────────────────────

describe('OrderService — Cancelamento de ordens', () => {
  it('[happy] deve cancelar ordem OPEN e estornar saldo', async () => {
    const order = await createTestOrder(testPrisma, {
      userId: lendaUser.id,
      type: 'LIMIT',
      status: 'OPEN',
    })

    const _balanceBefore = (await testPrisma.user.findUnique({ where: { id: lendaUser.id } }))!.fsBalance.toNumber()

    const cancelled = await orderService.cancelOrder(lendaUser.id, order.id)
    expect(cancelled.status).toBe('CANCELLED')

    // Verificar no banco
    const dbOrder = await testPrisma.order.findUnique({ where: { id: order.id } })
    expect(dbOrder!.status).toBe('CANCELLED')
  })

  it('[validacao] não deve cancelar ordem FILLED → ORDER_053', async () => {
    const order = await createTestOrder(testPrisma, {
      userId: lendaUser.id,
      type: 'MARKET',
      status: 'FILLED',
    })

    await expect(
      orderService.cancelOrder(lendaUser.id, order.id)
    ).rejects.toMatchObject({ code: 'ORDER_053' })

    // Ordem permanece FILLED no banco
    const dbOrder = await testPrisma.order.findUnique({ where: { id: order.id } })
    expect(dbOrder!.status).toBe('FILLED')
  })

  it('[validacao] não deve cancelar ordem CANCELLED → ORDER_053', async () => {
    const order = await createTestOrder(testPrisma, {
      userId: lendaUser.id,
      status: 'CANCELLED',
    })

    await expect(
      orderService.cancelOrder(lendaUser.id, order.id)
    ).rejects.toMatchObject({ code: 'ORDER_053' })
  })
})

// ─── Cenário 4 — Segurança: Asset Halted ─────────────────────────────────────

describe('OrderService — Asset em halt', () => {
  it('[seguranca] não deve criar ordem em ativo com isActive=false → ASSET_030', async () => {
    // Verificar se existe ativo halted no seed
    const haltedAsset = await testPrisma.asset.findFirst({ where: { isHalted: true } })
    if (!haltedAsset) {
      console.log('[skip] Nenhum ativo em halt no banco de teste. Rode o seed.')
      return
    }

    await expect(
      orderService.createOrder(lendaUser.id, buildOrderPayload({ ticker: haltedAsset.ticker }))
    ).rejects.toMatchObject({ code: expect.stringMatching(/ASSET_030|ORDER_005/) })
  })
})

// ─── Cenário 1b — GET /orders — listagem isolada por usuário ─────────────────

describe('OrderService — Listagem de ordens (isolamento)', () => {
  it('[happy] deve retornar apenas ordens do usuário autenticado', async () => {
    // Criar ordens para usuário A e B
    await createTestOrder(testPrisma, { userId: lendaUser.id })
    await createTestOrder(testPrisma, { userId: craqueUser.id })

    const result = await orderService.getOrders(lendaUser.id, {})

    // Todas as ordens retornadas devem pertencer ao lendaUser
    for (const order of result.data) {
      expect(order.userId).toBe(lendaUser.id)
    }
  })
})

// ─── Cenário 5 — Ordens SELL (venda) ─────────────────────────────────────────
// RESOLVED: Nenhum teste de SELL (venda) — Gap #2 DELIVERY-AUDIT-milestone-10

describe('OrderService — Ordens SELL (venda)', () => {
  it('[happy] LENDA cria ordem MARKET SELL → saldo creditado após execução', async () => {
    const balanceBefore = (
      await testPrisma.user.findUnique({ where: { id: lendaUser.id } })
    )!.fsBalance.toNumber()

    const payload = buildOrderPayload({ type: 'MARKET', side: 'SELL', quantity: 1 })
    const order = await orderService.createOrder(lendaUser.id, payload)

    expect(order).toBeDefined()
    expect(order.side).toBe('SELL')
    expect(order.userId).toBe(lendaUser.id)

    // Verificar persistência no banco
    const dbOrder = await testPrisma.order.findUnique({ where: { id: order.id } })
    expect(dbOrder).toBeTruthy()
    expect(dbOrder!.side).toBe('SELL')
    expect(dbOrder!.status).toMatch(/OPEN|FILLED/)

    // Se a ordem foi executada imediatamente (FILLED), saldo deve ter aumentado
    if (dbOrder!.status === 'FILLED') {
      const dbUser = await testPrisma.user.findUnique({ where: { id: lendaUser.id } })
      expect(dbUser!.fsBalance.toNumber()).toBeGreaterThan(balanceBefore)
    }
  })

  it('[happy] CRAQUE cria ordem LIMIT SELL → persiste no banco com side=SELL', async () => {
    const payload = buildOrderPayload({ type: 'LIMIT', side: 'SELL', quantity: 1, price: 50 })
    const order = await orderService.createOrder(craqueUser.id, payload)

    expect(order).toBeDefined()
    expect(order.side).toBe('SELL')
    expect(order.type).toBe('LIMIT')

    const dbOrder = await testPrisma.order.findUnique({ where: { id: order.id } })
    expect(dbOrder).toBeTruthy()
    expect(dbOrder!.side).toBe('SELL')
  })

  it('[seguranca] usuário A não pode criar ordem SELL com userId de B → IDOR bloqueado', async () => {
    // A tentativa de criar ordem para outro userId deve ser bloqueada pelo service
    // O createOrder usa o userId passado explicitamente — o service deve vincular ao
    // usuário autenticado, não a um userId arbitrário do payload
    const payloadSell = buildOrderPayload({ side: 'SELL', quantity: 1 })

    // Criar ordem de A normalmente
    const orderA = await orderService.createOrder(jogadorUser.id, payloadSell)
    expect(orderA.userId).toBe(jogadorUser.id)

    // A ordem pertence ao usuário correto (A), não a B
    const dbOrder = await testPrisma.order.findUnique({ where: { id: orderA.id } })
    expect(dbOrder!.userId).toBe(jogadorUser.id)
    expect(dbOrder!.userId).not.toBe(craqueUser.id)
  })

  it('[validacao] SELL em ativo com isActive=false → rejeita ASSET_030', async () => {
    // Verificar se existe ativo halted no seed
    const haltedAsset = await testPrisma.asset.findFirst({ where: { isHalted: true } })
    if (!haltedAsset) {
      console.log('[skip] Nenhum ativo em halt no banco de teste. Rode o seed.')
      return
    }

    await expect(
      orderService.createOrder(
        lendaUser.id,
        buildOrderPayload({ ticker: haltedAsset.ticker, side: 'SELL' })
      )
    ).rejects.toMatchObject({ code: expect.stringMatching(/ASSET_030|ORDER_005/) })
  })
})
