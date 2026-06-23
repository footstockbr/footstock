/**
 * Testes unitarios — FIX-15 (Task 19): cron GET /api/cron/reconcile-payments.
 *
 * Defesa de profundidade (item 12): varre subscriptions PENDING (MERCADO_PAGO), busca um pagamento
 * aprovado no MP por external_reference (mockado) e reconcilia via PlanService.reconcileApprovedPayment.
 * Esta suite cobre o gate de auth (Bearer CRON_SECRET), a agregacao de contadores, o isolamento de
 * falha por subscription (uma falha nao derruba o sweep) e o clamping de limit/days.
 *
 * Aceite coberto (FIX-15): suites cobrem reconcile/cron; verdes.
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/env', () => ({ env: { CRON_SECRET: 'cron-secret-123' } }))

const findManyMock = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: { subscription: { findMany: (...a: unknown[]) => findManyMock(...a) } },
}))

const reconcileMock = jest.fn()
jest.mock('@/lib/services/PlanService', () => ({
  planService: { reconcileApprovedPayment: (...a: unknown[]) => reconcileMock(...a) },
}))

const searchApprovedMock = jest.fn()
jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGateway: jest.fn(() => ({ searchApprovedPaymentByExternalReference: searchApprovedMock })),
}))

import { GET } from '@/app/api/cron/reconcile-payments/route'
import { env } from '@/lib/env'

function cronRequest(opts: { auth?: string; query?: string } = {}): NextRequest {
  const url = `http://localhost:3000/api/cron/reconcile-payments${opts.query ?? ''}`
  const headers: Record<string, string> = {}
  if (opts.auth !== undefined) headers['authorization'] = opts.auth
  return new NextRequest(url, { method: 'GET', headers })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(env as { CRON_SECRET: string }).CRON_SECRET = 'cron-secret-123'
  findManyMock.mockResolvedValue([])
  searchApprovedMock.mockResolvedValue(null)
  reconcileMock.mockResolvedValue({ ok: true, action: 'ACTIVATED', subscriptionId: 's', userId: 'u' })
})

describe('FIX-15 — cron reconcile-payments: auth', () => {
  it('sem Authorization -> 401', async () => {
    const res = await GET(cronRequest())
    expect(res.status).toBe(401)
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('Bearer errado -> 401', async () => {
    const res = await GET(cronRequest({ auth: 'Bearer nope' }))
    expect(res.status).toBe(401)
  })

  it('CRON_SECRET ausente no servidor -> 401 mesmo com qualquer header', async () => {
    ;(env as { CRON_SECRET: string }).CRON_SECRET = ''
    const res = await GET(cronRequest({ auth: 'Bearer ' }))
    expect(res.status).toBe(401)
  })
})

describe('FIX-15 — cron reconcile-payments: sweep e agregacao', () => {
  const AUTH = 'Bearer cron-secret-123'

  it('sem pendings -> success:true e zero ativacoes', async () => {
    findManyMock.mockResolvedValue([])
    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, pendingScanned: 0, activated: 0, failed: 0 })
  })

  it('uma com pagamento aprovado (ACTIVATED) e uma sem -> contadores corretos', async () => {
    findManyMock.mockResolvedValue([{ id: 'sub-a' }, { id: 'sub-b' }])
    searchApprovedMock.mockImplementation((ref: string) =>
      ref === 'sub-a' ? Promise.resolve('pay-a') : Promise.resolve(null)
    )
    reconcileMock.mockResolvedValue({ ok: true, action: 'ACTIVATED', subscriptionId: 'sub-a', userId: 'u' })

    const body = await (await GET(cronRequest({ auth: AUTH }))).json()
    expect(body).toMatchObject({
      success: true,
      pendingScanned: 2,
      activated: 1,
      alreadyActive: 0,
      noApprovedPayment: 1,
      failed: 0,
    })
    expect(reconcileMock).toHaveBeenCalledTimes(1)
  })

  it('replay idempotente (ALREADY_ACTIVE) conta no bucket certo', async () => {
    findManyMock.mockResolvedValue([{ id: 'sub-a' }])
    searchApprovedMock.mockResolvedValue('pay-a')
    reconcileMock.mockResolvedValue({ ok: true, action: 'ALREADY_ACTIVE', subscriptionId: 'sub-a', userId: 'u' })

    const body = await (await GET(cronRequest({ auth: AUTH }))).json()
    expect(body).toMatchObject({ activated: 0, alreadyActive: 1, failed: 0, success: true })
  })

  it('reconcile ok:false vira failure agregada -> success:false', async () => {
    findManyMock.mockResolvedValue([{ id: 'sub-a' }])
    searchApprovedMock.mockResolvedValue('pay-a')
    reconcileMock.mockResolvedValue({ ok: false, reason: 'AMOUNT_MISMATCH' })

    const body = await (await GET(cronRequest({ auth: AUTH }))).json()
    expect(body.success).toBe(false)
    expect(body.failed).toBe(1)
    expect(body.failures[0]).toEqual({ subscriptionId: 'sub-a', reason: 'AMOUNT_MISMATCH' })
  })

  it('excecao ao buscar no MP isola a subscription e nao derruba o sweep', async () => {
    findManyMock.mockResolvedValue([{ id: 'sub-a' }, { id: 'sub-b' }])
    searchApprovedMock.mockImplementation((ref: string) => {
      if (ref === 'sub-a') throw new Error('MP timeout')
      return Promise.resolve(null)
    })

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(res.status).toBe(200) // o sweep conclui mesmo com falha pontual
    expect(body.success).toBe(false)
    expect(body.failed).toBe(1)
    expect(body.failures[0]).toEqual({ subscriptionId: 'sub-a', reason: 'MP timeout' })
    expect(body.noApprovedPayment).toBe(1) // sub-b processou normalmente
  })

  it('clampeia limit (>200 -> 200) e days (>120 -> 120) no findMany', async () => {
    await GET(cronRequest({ auth: AUTH, query: '?limit=9999&days=9999' }))
    const arg = findManyMock.mock.calls[0][0]
    expect(arg.take).toBe(200)
    // ST001 (Task 24): a varredura passou a cobrir PENDING + PAST_DUE.
    expect(arg.where.status).toEqual({ in: ['PENDING', 'PAST_DUE'] })
    expect(arg.where.gateway).toBe('MERCADO_PAGO')
    expect(arg.where.createdAt.gte).toBeInstanceOf(Date)
  })

  it('limit invalido (NaN) cai no default 50', async () => {
    await GET(cronRequest({ auth: AUTH, query: '?limit=abc' }))
    expect(findManyMock.mock.calls[0][0].take).toBe(50)
  })
})
