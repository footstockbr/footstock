/**
 * Testes unitarios — Higiene P3 (Task 24): POST /api/v1/admin/payments/replay.
 *
 * Cobre:
 *  - ST002: rate-limit no replay — excedido retorna 429 com Retry-After e NÃO reprocessa.
 *  - ST009: o IP do cliente é resolvido pelo hop CONFIÁVEL (mitiga X-Forwarded-For spoof):
 *    entradas forjadas à esquerda da cadeia não trocam a chave do rate-limit.
 *
 * `@/middleware/rateLimit` NÃO é mockado (helper puro resolveTrustedClientIp testado de verdade).
 * Só o limiter (`getReplayRateLimit`) é mockado para forçar success/fail determinístico.
 */

import { NextRequest } from 'next/server'

jest.mock('@/app/api/middleware', () => ({
  withAdmin: () => (handler: unknown) => handler,
}))

jest.mock('@/lib/env', () => ({ env: { TRUSTED_PROXY_HOPS: 1 } }))

const reconcileMock = jest.fn()
jest.mock('@/lib/services/PlanService', () => ({
  planService: { reconcileApprovedPayment: (...a: unknown[]) => reconcileMock(...a) },
}))

const logWebhookMock = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/services/WebhookAuditService', () => ({
  webhookAuditService: { logWebhook: (...a: unknown[]) => logWebhookMock(...a) },
}))

const limitMock = jest.fn()
jest.mock('@/lib/ratelimit', () => ({
  getReplayRateLimit: () => ({ limit: (...a: unknown[]) => limitMock(...a) }),
}))

import { POST } from '@/app/api/v1/admin/payments/replay/route'
import { resolveTrustedClientIp } from '@/middleware/rateLimit'

function replayRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/admin/payments/replay', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ gateway: 'MERCADO_PAGO', paymentId: 'pay-1' }),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  logWebhookMock.mockResolvedValue(undefined)
  limitMock.mockResolvedValue({ success: true, remaining: 19, reset: Date.now() + 60000 })
  reconcileMock.mockResolvedValue({ ok: true, action: 'ACTIVATED', subscriptionId: 's', userId: 'u' })
})

// ─── ST002: rate-limit ────────────────────────────────────────────────────────
describe('ST002 — replay com rate-limit', () => {
  it('happy: dentro do limite => processa o replay (reconcile chamado)', async () => {
    const res = await POST(replayRequest({ 'x-forwarded-for': '1.2.3.4' }))
    expect(limitMock).toHaveBeenCalledTimes(1)
    expect(reconcileMock).toHaveBeenCalledWith(expect.anything(), 'pay-1')
    expect(res.status).toBe(200)
  })

  it('sad: limite excedido => 429 com Retry-After e NÃO reprocessa', async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 30000 })
    const res = await POST(replayRequest({ 'x-forwarded-for': '1.2.3.4' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(reconcileMock).not.toHaveBeenCalled()
  })
})

// ─── ST009: XFF spoof ────────────────────────────────────────────────────────
describe('ST009 — resolveTrustedClientIp (helper puro)', () => {
  it('usa o hop da direita (trusted), não o cliente-controlado à esquerda', () => {
    expect(resolveTrustedClientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }), 1)).toBe('2.2.2.2')
  })

  it('XFF spoofado à esquerda NÃO muda o IP resolvido', () => {
    const semSpoof = resolveTrustedClientIp(new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }), 1)
    const comSpoof = resolveTrustedClientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1, 2.2.2.2' }), 1)
    expect(comSpoof).toBe(semSpoof)
    expect(comSpoof).toBe('2.2.2.2')
  })

  it('x-real-ip (setado pelo edge confiável) tem precedência', () => {
    expect(
      resolveTrustedClientIp(new Headers({ 'x-real-ip': '3.3.3.3', 'x-forwarded-for': '9.9.9.9, 2.2.2.2' }), 1)
    ).toBe('3.3.3.3')
  })

  it('sem headers => 0.0.0.0', () => {
    expect(resolveTrustedClientIp(new Headers({}), 1)).toBe('0.0.0.0')
  })
})

describe('ST009 — rota: spoof não burla o rate-limit', () => {
  it('chave do limiter é a mesma com e sem entradas spoofadas à esquerda', async () => {
    await POST(replayRequest({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))
    await POST(replayRequest({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1, 2.2.2.2' }))
    expect(limitMock).toHaveBeenCalledTimes(2)
    expect(limitMock.mock.calls[0][0]).toBe('2.2.2.2')
    expect(limitMock.mock.calls[1][0]).toBe('2.2.2.2')
  })
})
