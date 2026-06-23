/**
 * Testes unitarios — Higiene P3 (Task 24): cron GET /api/cron/reconcile-payments.
 *
 * Cobre:
 *  - ST001: a varredura inclui PAST_DUE (não só PENDING) — recuperação de dunning cujo
 *    webhook se perdeu precisa ser reconciliada.
 *  - ST004: janela de execução (RECONCILE_WINDOW_UTC) — fora da janela faz early-return SEM
 *    efeitos colaterais (nenhuma leitura/escrita no DB), com motivo observável.
 *  - ST005: NOT_ACTIVATABLE é SKIP neutro, não falha — não infla `failed` nem derruba `success`.
 */

import { NextRequest } from 'next/server'

jest.mock('@/lib/env', () => ({ env: { CRON_SECRET: 'cron-secret-123', RECONCILE_WINDOW_UTC: undefined } }))

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

import { GET, isWithinReconcileWindow } from '@/app/api/cron/reconcile-payments/route'
import { env } from '@/lib/env'

function cronRequest(opts: { auth?: string; query?: string } = {}): NextRequest {
  const url = `http://localhost:3000/api/cron/reconcile-payments${opts.query ?? ''}`
  const headers: Record<string, string> = {}
  if (opts.auth !== undefined) headers['authorization'] = opts.auth
  return new NextRequest(url, { method: 'GET', headers })
}

const AUTH = 'Bearer cron-secret-123'

beforeEach(() => {
  jest.clearAllMocks()
  ;(env as { CRON_SECRET?: string }).CRON_SECRET = 'cron-secret-123'
  ;(env as { RECONCILE_WINDOW_UTC?: string }).RECONCILE_WINDOW_UTC = undefined
  findManyMock.mockResolvedValue([])
  searchApprovedMock.mockResolvedValue(null)
  reconcileMock.mockResolvedValue({ ok: true, action: 'ACTIVATED', subscriptionId: 's', userId: 'u' })
})

// ─── ST001: varredura cobre PAST_DUE ────────────────────────────────────────────
describe('ST001 — reconcile cobre PAST_DUE', () => {
  it('happy: varre PENDING + PAST_DUE de MERCADO_PAGO', async () => {
    await GET(cronRequest({ auth: AUTH }))
    expect(findManyMock).toHaveBeenCalledTimes(1)
    const arg = findManyMock.mock.calls[0][0] as { where: { status: { in: string[] }; gateway: string } }
    expect(arg.where.status.in).toEqual(expect.arrayContaining(['PENDING', 'PAST_DUE']))
    expect(arg.where.gateway).toBe('MERCADO_PAGO')
  })

  it('sad: subscription PAST_DUE com pagamento approved é reconciliada (reativada)', async () => {
    findManyMock.mockResolvedValue([{ id: 'sub-pastdue' }])
    searchApprovedMock.mockResolvedValue('pay-1')
    reconcileMock.mockResolvedValue({ ok: true, action: 'ACTIVATED', subscriptionId: 'sub-pastdue', userId: 'u' })

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(reconcileMock).toHaveBeenCalledWith(expect.anything(), 'pay-1')
    expect(body.activated).toBe(1)
    expect(body.success).toBe(true)
  })
})

// ─── ST004: janela de execução ──────────────────────────────────────────────────
describe('ST004 — janela do cron (helper puro)', () => {
  it('happy: sem spec => sempre dentro da janela', () => {
    expect(isWithinReconcileWindow(new Date('2026-06-23T03:00:00Z'), undefined)).toBe(true)
    expect(isWithinReconcileWindow(new Date('2026-06-23T03:00:00Z'), '')).toBe(true)
  })

  it('dentro da janela "2-6" às 03:00 UTC => true', () => {
    expect(isWithinReconcileWindow(new Date('2026-06-23T03:00:00Z'), '2-6')).toBe(true)
  })

  it('sad: fora da janela "2-6" às 10:00 UTC => false', () => {
    expect(isWithinReconcileWindow(new Date('2026-06-23T10:00:00Z'), '2-6')).toBe(false)
  })

  it('janela que cruza meia-noite "22-3" às 01:00 UTC => true', () => {
    expect(isWithinReconcileWindow(new Date('2026-06-23T01:00:00Z'), '22-3')).toBe(true)
  })

  it('janela vazia "5-5" => sempre fora', () => {
    expect(isWithinReconcileWindow(new Date('2026-06-23T05:00:00Z'), '5-5')).toBe(false)
  })

  it('spec malformado => fail-open (sempre dentro)', () => {
    expect(isWithinReconcileWindow(new Date('2026-06-23T05:00:00Z'), 'lixo')).toBe(true)
  })
})

describe('ST004 — janela do cron (rota)', () => {
  it('sad: fora da janela => early-return skipped SEM tocar o DB', async () => {
    ;(env as { RECONCILE_WINDOW_UTC?: string }).RECONCILE_WINDOW_UTC = '5-5' // janela vazia => sempre fora
    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(body.skipped).toBe(true)
    expect(body.reason).toBe('OUTSIDE_WINDOW')
    expect(findManyMock).not.toHaveBeenCalled()
    expect(reconcileMock).not.toHaveBeenCalled()
  })

  it('happy: dentro da janela (sem spec) => processa normalmente', async () => {
    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(body.skipped).toBeUndefined()
    expect(findManyMock).toHaveBeenCalledTimes(1)
  })
})

// ─── ST005: NOT_ACTIVATABLE neutro ───────────────────────────────────────────────
describe('ST005 — NOT_ACTIVATABLE não infla success=false', () => {
  it('happy: NOT_ACTIVATABLE conta como skip neutro, success permanece true', async () => {
    findManyMock.mockResolvedValue([{ id: 'sub-terminal' }])
    searchApprovedMock.mockResolvedValue('pay-x')
    reconcileMock.mockResolvedValue({ ok: false, reason: 'NOT_ACTIVATABLE', detail: 'sub-terminal' })

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(body.notActivatable).toBe(1)
    expect(body.failed).toBe(0)
    expect(body.success).toBe(true)
  })

  it('sad: falha real (não NOT_ACTIVATABLE) ainda conta como failure', async () => {
    findManyMock.mockResolvedValue([{ id: 'sub-err' }])
    searchApprovedMock.mockResolvedValue('pay-y')
    reconcileMock.mockResolvedValue({ ok: false, reason: 'AMOUNT_MISMATCH', detail: 'pago=1 esperado=3990' })

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(body.failed).toBe(1)
    expect(body.notActivatable).toBe(0)
    expect(body.success).toBe(false)
  })
})
