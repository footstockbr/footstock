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
const renewalMock = jest.fn()
jest.mock('@/lib/services/PlanService', () => ({
  planService: {
    reconcileApprovedPayment: (...a: unknown[]) => reconcileMock(...a),
    reconcileRenewalPayment: (...a: unknown[]) => renewalMock(...a),
  },
}))

const searchApprovedMock = jest.fn()
const subStatusMock = jest.fn()
jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGateway: jest.fn(() => ({
    searchApprovedPaymentByExternalReference: searchApprovedMock,
    getSubscriptionStatus: (...a: unknown[]) => subStatusMock(...a),
  })),
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
  // Alerta de PENDING autorizado (incidente 2026-07-03): default = preapproval nao-autorizado.
  subStatusMock.mockResolvedValue({ status: 'pending' })
  reconcileMock.mockResolvedValue({ ok: true, action: 'ACTIVATED', subscriptionId: 's', userId: 'u' })
  // item 4b: sweep de renovação de ciclo pago — benigno por default (não interfere no sweep PENDING).
  renewalMock.mockResolvedValue({ ok: true, action: 'NO_APPROVED_PAYMENT', subscriptionId: 's' })
})

// ─── ST001: varredura cobre PAST_DUE ────────────────────────────────────────────
describe('ST001 — reconcile cobre PAST_DUE', () => {
  it('happy: varre PENDING + PAST_DUE de MERCADO_PAGO', async () => {
    await GET(cronRequest({ auth: AUTH }))
    // 2 findMany: [0] sweep PENDING/PAST_DUE (ativação) + [1] sweep recorrente lapsado (item 4b renovação).
    expect(findManyMock).toHaveBeenCalledTimes(2)
    const arg = findManyMock.mock.calls[0][0] as { where: { status: { in: string[] }; gateway: string } }
    expect(arg.where.status.in).toEqual(expect.arrayContaining(['PENDING', 'PAST_DUE']))
    expect(arg.where.gateway).toBe('MERCADO_PAGO')
    const renewalArg = findManyMock.mock.calls[1][0] as { where: { billingMode: string; status: { in: string[] } } }
    expect(renewalArg.where.billingMode).toBe('recurring')
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
    // 2 sweeps: PENDING/PAST_DUE + recorrente lapsado (item 4b).
    expect(findManyMock).toHaveBeenCalledTimes(2)
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

// ─── Alerta PENDING autorizado (incidente 2026-07-03) ────────────────────────────
// Preapproval `authorized` no MP (cliente cobrado) sem pagamento reconciliavel por
// external_reference = blind spot residual do sweep. O cron ALERTA (observabilidade)
// sem derrubar success — a investigacao e humana.
describe('Alerta — PENDING 15+ min com preapproval authorized sem payment', () => {
  const OLD = new Date(Date.now() - 30 * 60 * 1000) // 30 min atras
  const FRESH = new Date(Date.now() - 2 * 60 * 1000) // 2 min atras
  const recurringSub = (id: string, createdAt: Date) => ({
    id,
    createdAt,
    billingMode: 'recurring',
    gatewaySubscriptionId: `pre-${id}`,
  })

  it('happy: recorrente antiga + authorized + sem payment => alerta, success permanece true', async () => {
    findManyMock.mockResolvedValueOnce([recurringSub('sub-alert', OLD)]).mockResolvedValueOnce([])
    searchApprovedMock.mockResolvedValue(null)
    subStatusMock.mockResolvedValue({ status: 'authorized' })

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(subStatusMock).toHaveBeenCalledWith('pre-sub-alert')
    expect(body.pendingAuthorizedAlerts).toBe(1)
    expect(body.pendingAuthorizedSubscriptionIds).toEqual(['sub-alert'])
    expect(body.noApprovedPayment).toBe(1)
    expect(body.success).toBe(true)
  })

  it('sad: sub recente (< 15 min) nao consulta o gateway nem alerta (checkout em andamento)', async () => {
    findManyMock.mockResolvedValueOnce([recurringSub('sub-fresh', FRESH)]).mockResolvedValueOnce([])
    searchApprovedMock.mockResolvedValue(null)

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(subStatusMock).not.toHaveBeenCalled()
    expect(body.pendingAuthorizedAlerts).toBe(0)
  })

  it('sad: preapproval nao-authorized (pending) nao alerta', async () => {
    findManyMock.mockResolvedValueOnce([recurringSub('sub-pend', OLD)]).mockResolvedValueOnce([])
    searchApprovedMock.mockResolvedValue(null)
    subStatusMock.mockResolvedValue({ status: 'pending' })

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(body.pendingAuthorizedAlerts).toBe(0)
  })

  it('sad: falha na consulta de status do gateway NAO derruba o sweep (best-effort)', async () => {
    findManyMock.mockResolvedValueOnce([recurringSub('sub-gwerr', OLD)]).mockResolvedValueOnce([])
    searchApprovedMock.mockResolvedValue(null)
    subStatusMock.mockRejectedValue(new Error('MP 500'))

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(body.pendingAuthorizedAlerts).toBe(0)
    expect(body.failed).toBe(0)
    expect(body.success).toBe(true)
  })

  it('sad: one-time (nao recorrente) sem payment nao consulta status', async () => {
    findManyMock
      .mockResolvedValueOnce([{ id: 'sub-onetime', createdAt: OLD, billingMode: 'one_time', gatewaySubscriptionId: null }])
      .mockResolvedValueOnce([])
    searchApprovedMock.mockResolvedValue(null)

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(subStatusMock).not.toHaveBeenCalled()
    expect(body.pendingAuthorizedAlerts).toBe(0)
  })

  it('happy: payment encontrado segue para reconcile sem alerta (caminho normal)', async () => {
    findManyMock.mockResolvedValueOnce([recurringSub('sub-ok', OLD)]).mockResolvedValueOnce([])
    searchApprovedMock.mockResolvedValue('pay-ok')
    reconcileMock.mockResolvedValue({ ok: true, action: 'ACTIVATED', subscriptionId: 'sub-ok', userId: 'u' })

    const res = await GET(cronRequest({ auth: AUTH }))
    const body = await res.json()
    expect(subStatusMock).not.toHaveBeenCalled()
    expect(body.activated).toBe(1)
    expect(body.pendingAuthorizedAlerts).toBe(0)
  })
})
