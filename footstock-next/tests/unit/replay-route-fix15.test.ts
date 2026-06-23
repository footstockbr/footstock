/**
 * Testes unitarios — FIX-15 (Task 19): POST /api/v1/admin/payments/replay.
 *
 * Reprocessa sob demanda um pagamento aprovado que nao ativou o plano (janela do bug do HMAC,
 * item 12), reusando o caminho idempotente do webhook via planService.reconcileApprovedPayment.
 * Esta suite cobre validacao de corpo, o mapeamento de status HTTP (200 sucesso / 422 falha) e a
 * trilha de auditoria (ACCEPTED no sucesso, REJECTED na falha) visivel no painel de webhooks.
 *
 * Aceite coberto (FIX-15): suites cobrem replay; verdes.
 *
 * withAdmin e mockado como pass-through — a politica de auth/role tem suite propria (middleware);
 * aqui isolamos o handler.
 */

import { NextRequest } from 'next/server'

jest.mock('@/app/api/middleware', () => ({
  withAdmin: () => (handler: unknown) => handler,
}))

const reconcileMock = jest.fn()
jest.mock('@/lib/services/PlanService', () => ({
  planService: { reconcileApprovedPayment: (...a: unknown[]) => reconcileMock(...a) },
}))

const logWebhookMock = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/services/WebhookAuditService', () => ({
  webhookAuditService: { logWebhook: (...a: unknown[]) => logWebhookMock(...a) },
}))

import { POST } from '@/app/api/v1/admin/payments/replay/route'

function replayRequest(body: unknown, opts: { rawInvalid?: boolean } = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/admin/payments/replay', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: opts.rawInvalid ? '{not json' : JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  logWebhookMock.mockResolvedValue(undefined)
})

describe('FIX-15 — replay admin: validacao de corpo', () => {
  it('JSON malformado -> 400 INVALID_JSON, nunca chama reconcile', async () => {
    const res = await POST(replayRequest({}, { rawInvalid: true }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_JSON')
    expect(reconcileMock).not.toHaveBeenCalled()
  })

  it('paymentId ausente -> 400 VALIDATION', async () => {
    const res = await POST(replayRequest({ gateway: 'MERCADO_PAGO' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('VALIDATION')
    expect(reconcileMock).not.toHaveBeenCalled()
  })

  it('paymentId vazio (so espacos) -> 400 VALIDATION', async () => {
    const res = await POST(replayRequest({ paymentId: '   ' }))
    expect(res.status).toBe(400)
    expect(reconcileMock).not.toHaveBeenCalled()
  })
})

describe('FIX-15 — replay admin: mapeamento de status + auditoria', () => {
  it('reconcile ok -> 200 com data + audit ACCEPTED', async () => {
    reconcileMock.mockResolvedValue({ ok: true, action: 'ACTIVATED', subscriptionId: 'sub-9', userId: 'u' })

    const res = await POST(replayRequest({ paymentId: 'pay-9' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toMatchObject({ ok: true, action: 'ACTIVATED' })
    expect(reconcileMock).toHaveBeenCalledWith('MERCADO_PAGO', 'pay-9')

    expect(logWebhookMock).toHaveBeenCalledTimes(1)
    const audit = logWebhookMock.mock.calls[0][0]
    expect(audit.status).toBe('ACCEPTED')
    expect(audit.transactionId).toBe('pay-9')
    expect(audit.subscriptionId).toBe('sub-9')
    expect(audit.hmacValid).toBe(true)
  })

  it('reconcile falha -> 422 + audit REJECTED com motivo no errorMessage', async () => {
    reconcileMock.mockResolvedValue({ ok: false, reason: 'PAYMENT_NOT_APPROVED', detail: 'pending' })

    const res = await POST(replayRequest({ paymentId: 'pay-x' }))
    expect(res.status).toBe(422)
    expect((await res.json()).data).toMatchObject({ ok: false, reason: 'PAYMENT_NOT_APPROVED' })

    const audit = logWebhookMock.mock.calls[0][0]
    expect(audit.status).toBe('REJECTED')
    expect(audit.errorMessage).toContain('PAYMENT_NOT_APPROVED')
    expect(audit.errorMessage).toContain('pending')
    expect(audit.subscriptionId).toBeUndefined()
  })

  it('falha do audit log nao quebra a resposta (catch best-effort)', async () => {
    reconcileMock.mockResolvedValue({ ok: true, action: 'ALREADY_ACTIVE', subscriptionId: 's', userId: 'u' })
    logWebhookMock.mockRejectedValue(new Error('db down'))

    const res = await POST(replayRequest({ paymentId: 'pay-z' }))
    expect(res.status).toBe(200)
  })
})
