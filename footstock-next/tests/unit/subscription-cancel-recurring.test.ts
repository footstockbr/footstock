/**
 * Suite — política de cancelamento recorrente (pause_on_lock_start)
 * Loop 06-26-foot-stock-pagamentos-recorrencia-pagseguro, Item 005 (G0.5).
 *
 * Prova, contra a unidade REAL de produção (prisma/gateway mockados, sem rede), o
 * contrato de SubscriptionService.syncGatewayAutoRenewal — o ponto de chamada ÚNICO
 * reutilizado pelo DELETE /me (cancel) e pelo PUT /me/revert (reactivate):
 *
 *  - Guarda de elegibilidade INVARIANTE: cancelAutoRenewal/reactivateAutoRenewal só
 *    são chamados quando billingMode === 'recurring' E gatewaySubscriptionId != null;
 *    qualquer outro caso é no-op explícito (nunca chamada ao gateway, nunca erro).
 *  - cancel (recurring) → gateway.cancelAutoRenewal + gatewayStatus='paused' persistido.
 *  - reactivate (recurring) → gateway.reactivateAutoRenewal + gatewayStatus='authorized'.
 *  - Idempotência: já no estado-alvo → nenhuma 2ª chamada ao gateway.
 *  - Sem sucesso silencioso: falha do gateway grava marcador compensatório
 *    ('cancel_pending'/'reactivate_pending') e RELANÇA — nunca resolve como sucesso.
 */

// ─── Mocks compartilhados ───────────────────────────────────────────────────

const mockSubUpdate = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      update: (...a: unknown[]) => mockSubUpdate(...a),
    },
  },
}))

const mockCancelAutoRenewal = jest.fn()
const mockReactivateAutoRenewal = jest.fn()
jest.mock('@/lib/gateways/GatewayFactory', () => ({
  getGateway: () => ({
    cancelAutoRenewal: (...a: unknown[]) => mockCancelAutoRenewal(...a),
    reactivateAutoRenewal: (...a: unknown[]) => mockReactivateAutoRenewal(...a),
  }),
}))

import { subscriptionService, isAutoRenewalEligible } from '@/lib/services/SubscriptionService'

// ─── Helpers ────────────────────────────────────────────────────────────────

function recurringSub(over: Record<string, unknown> = {}) {
  return {
    id: 'sub_1',
    gateway: 'MERCADO_PAGO',
    billingMode: 'recurring',
    gatewaySubscriptionId: 'pre_1',
    gatewayStatus: 'authorized',
    ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSubUpdate.mockResolvedValue({})
  mockCancelAutoRenewal.mockResolvedValue(undefined)
  mockReactivateAutoRenewal.mockResolvedValue(undefined)
})

// ─── Guarda de elegibilidade (invariante única) ─────────────────────────────

describe('isAutoRenewalEligible — guarda invariante única', () => {
  it('recurring + gatewaySubscriptionId presente → elegível', () => {
    expect(isAutoRenewalEligible({ billingMode: 'recurring', gatewaySubscriptionId: 'pre_1' })).toBe(true)
  })

  it('one_time → NÃO elegível (mesmo com gatewaySubscriptionId)', () => {
    expect(isAutoRenewalEligible({ billingMode: 'one_time', gatewaySubscriptionId: 'pre_1' })).toBe(false)
  })

  it('recurring sem gatewaySubscriptionId → NÃO elegível', () => {
    expect(isAutoRenewalEligible({ billingMode: 'recurring', gatewaySubscriptionId: null })).toBe(false)
  })
})

// ─── cancel (DELETE /me, pause_on_lock_start) ───────────────────────────────

describe('syncGatewayAutoRenewal — cancel (pause no início do lock)', () => {
  it('recurring → chama cancelAutoRenewal e persiste gatewayStatus=paused', async () => {
    const res = await subscriptionService.syncGatewayAutoRenewal(recurringSub(), 'cancel')

    expect(mockCancelAutoRenewal).toHaveBeenCalledTimes(1)
    expect(mockCancelAutoRenewal).toHaveBeenCalledWith('pre_1')
    expect(mockSubUpdate).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { gatewayStatus: 'paused' },
    })
    expect(res).toEqual({ eligible: true, called: true, gatewayStatus: 'paused' })
  })

  it('one_time → no-op explícito: nenhuma chamada ao gateway, nenhum write', async () => {
    const res = await subscriptionService.syncGatewayAutoRenewal(
      recurringSub({ billingMode: 'one_time', gatewayStatus: null }),
      'cancel',
    )

    expect(mockCancelAutoRenewal).not.toHaveBeenCalled()
    expect(mockSubUpdate).not.toHaveBeenCalled()
    expect(res).toEqual({ eligible: false, called: false, gatewayStatus: null })
  })

  it('recurring sem gatewaySubscriptionId → no-op (inconsistência não chama o gateway)', async () => {
    const res = await subscriptionService.syncGatewayAutoRenewal(
      recurringSub({ gatewaySubscriptionId: null, gatewayStatus: null }),
      'cancel',
    )

    expect(mockCancelAutoRenewal).not.toHaveBeenCalled()
    expect(res.eligible).toBe(false)
    expect(res.called).toBe(false)
  })

  it('idempotente: já paused → nenhuma 2ª chamada ao gateway', async () => {
    const res = await subscriptionService.syncGatewayAutoRenewal(
      recurringSub({ gatewayStatus: 'paused' }),
      'cancel',
    )

    expect(mockCancelAutoRenewal).not.toHaveBeenCalled()
    expect(mockSubUpdate).not.toHaveBeenCalled()
    expect(res).toEqual({ eligible: true, called: false, gatewayStatus: 'paused' })
  })

  it('falha do gateway → grava compensatório cancel_pending e RELANÇA (sem sucesso silencioso)', async () => {
    mockCancelAutoRenewal.mockRejectedValue(new Error('[MERCADO_PAGO] cancelAutoRenewal rejeitado HTTP 422'))

    await expect(
      subscriptionService.syncGatewayAutoRenewal(recurringSub(), 'cancel'),
    ).rejects.toThrow(/422/)

    expect(mockSubUpdate).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { gatewayStatus: 'cancel_pending' },
    })
    // nunca persistiu o alvo 'paused' (não declarou sucesso)
    expect(mockSubUpdate).not.toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { gatewayStatus: 'paused' },
    })
  })
})

// ─── reactivate (PUT /me/revert) ────────────────────────────────────────────

describe('syncGatewayAutoRenewal — reactivate (revert do lock)', () => {
  it('recurring paused → chama reactivateAutoRenewal e persiste gatewayStatus=authorized', async () => {
    const res = await subscriptionService.syncGatewayAutoRenewal(
      recurringSub({ gatewayStatus: 'paused' }),
      'reactivate',
    )

    expect(mockReactivateAutoRenewal).toHaveBeenCalledTimes(1)
    expect(mockReactivateAutoRenewal).toHaveBeenCalledWith('pre_1')
    expect(mockSubUpdate).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { gatewayStatus: 'authorized' },
    })
    expect(res).toEqual({ eligible: true, called: true, gatewayStatus: 'authorized' })
  })

  it('one_time → no-op explícito no revert', async () => {
    const res = await subscriptionService.syncGatewayAutoRenewal(
      recurringSub({ billingMode: 'one_time', gatewayStatus: null }),
      'reactivate',
    )

    expect(mockReactivateAutoRenewal).not.toHaveBeenCalled()
    expect(res.eligible).toBe(false)
  })

  it('falha do gateway → grava compensatório reactivate_pending e RELANÇA', async () => {
    mockReactivateAutoRenewal.mockRejectedValue(new Error('gateway 5xx'))

    await expect(
      subscriptionService.syncGatewayAutoRenewal(recurringSub({ gatewayStatus: 'paused' }), 'reactivate'),
    ).rejects.toThrow(/5xx/)

    expect(mockSubUpdate).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { gatewayStatus: 'reactivate_pending' },
    })
    expect(mockSubUpdate).not.toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { gatewayStatus: 'authorized' },
    })
  })
})
