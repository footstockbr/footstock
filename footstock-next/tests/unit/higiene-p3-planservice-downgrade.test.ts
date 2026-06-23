/**
 * Testes unitarios — Higiene P3 (Task 24), ST006: PlanService.upgradeUser.
 *
 * Downgrade-obsoleto deve cobrir PAST_DUE/TRIAL, não só PENDING. Uma subscription
 * PAST_DUE/TRIAL obsoleta (cujo plano superior já foi restaurado) precisa ser cancelada
 * aqui; antes, com o filtro só-PENDING, ela escapava e caía na transação de ativação,
 * aplicando um downgrade obsoleto que derrubava o plano restaurado.
 */

jest.mock('@/lib/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://example.test' } }))

jest.mock('@/lib/prisma', () => {
  const subscription = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  }
  const user = { findUnique: jest.fn(), update: jest.fn() }
  const notification = { create: jest.fn().mockResolvedValue({}) }
  const prisma: Record<string, unknown> & {
    $transaction?: (arg: unknown) => Promise<unknown>
  } = { subscription, user, notification }
  prisma.$transaction = jest.fn(async (arg: unknown): Promise<unknown> => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(prisma)
    return Promise.all(arg as Promise<unknown>[])
  })
  return { prisma }
})

jest.mock('@/lib/gateways/GatewayFactory', () => ({ getGateway: jest.fn() }))
jest.mock('@/lib/services/SubscriptionService', () => ({
  subscriptionService: { createSubscription: jest.fn() },
}))
jest.mock('@/lib/services/LeagueAutoEnrollService', () => ({
  leagueAutoEnrollService: { enrollUserInPublicLeague: jest.fn().mockResolvedValue(undefined) },
}))
jest.mock('@/lib/notifications', () => ({
  notificationService: { notify: jest.fn().mockResolvedValue({ notification: {}, deduped: false }) },
}))

import { PlanService } from '@/lib/services/PlanService'
import { prisma } from '@/lib/prisma'

const planService = new PlanService()
const sub = prisma.subscription as unknown as Record<string, jest.Mock>
const usr = prisma.user as unknown as Record<string, jest.Mock>

beforeEach(() => {
  jest.clearAllMocks()
  sub.updateMany.mockResolvedValue({ count: 1 })
  sub.findFirst.mockResolvedValue(null) // sem CANCELLATION_LOCK => downgrade é obsoleto
})

describe('ST006 — downgrade-obsoleto cobre PAST_DUE/TRIAL', () => {
  it('PAST_DUE obsoleto: cancela cobrindo PAST_DUE e retorna NOT_ACTIVATABLE', async () => {
    // sub destino é CRAQUE (inferior) em status PAST_DUE; usuário atual é LENDA (restaurada)
    sub.findUnique.mockResolvedValue({
      id: 'sub-down', userId: 'u1', planType: 'CRAQUE', status: 'PAST_DUE', amount: 3990,
    })
    usr.findUnique.mockResolvedValue({ planType: 'LENDA', adminRole: null })

    const result = await planService.upgradeUser('u1', 'sub-down')

    expect(result).toBe('NOT_ACTIVATABLE')
    expect(sub.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'sub-down',
          userId: 'u1',
          status: { in: expect.arrayContaining(['PENDING', 'PAST_DUE', 'TRIAL', 'TRIALING']) },
        }),
        data: expect.objectContaining({ status: 'CANCELLED' }),
      })
    )
    // não deve ter ativado (user.update de planType não chamado)
    expect(usr.update).not.toHaveBeenCalled()
  })

  it('TRIAL obsoleto: idem, cobre TRIAL', async () => {
    sub.findUnique.mockResolvedValue({
      id: 'sub-trial', userId: 'u1', planType: 'CRAQUE', status: 'TRIAL', amount: 3990,
    })
    usr.findUnique.mockResolvedValue({ planType: 'LENDA', adminRole: null })

    const result = await planService.upgradeUser('u1', 'sub-trial')

    expect(result).toBe('NOT_ACTIVATABLE')
    const arg = sub.updateMany.mock.calls[0][0] as { where: { status: { in: string[] } } }
    expect(arg.where.status.in).toEqual(expect.arrayContaining(['PAST_DUE', 'TRIAL']))
  })

  it('não-obsoleto (há CANCELLATION_LOCK): NÃO cancela como obsoleto, ativa normalmente', async () => {
    sub.findUnique.mockResolvedValue({
      id: 'sub-down', userId: 'u1', planType: 'CRAQUE', status: 'PENDING', amount: 3990,
    })
    usr.findUnique.mockResolvedValue({ planType: 'LENDA', adminRole: null })
    sub.findMany.mockResolvedValue([])
    // lockedSub presente => downgrade legítimo (não-obsoleto)
    sub.findFirst.mockResolvedValue({ id: 'locked', planType: 'LENDA' })

    const result = await planService.upgradeUser('u1', 'sub-down')

    expect(result).toBe('ACTIVATED')
  })
})
