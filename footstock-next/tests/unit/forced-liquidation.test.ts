/**
 * Testes unitários — FIX-08: liquidação compulsória de posições restritas.
 * Loop 06-22-footstock-financeiro-planos (Task 13).
 *
 * Cobre o núcleo reutilizado pela rota self-service de refund e pelo webhook
 * REFUND_COMPLETED: posições SHORT/alavancadas são encerradas e ordens OCO/SCHEDULED
 * canceladas; `cleared` só é true quando nada sobrou aberto E nada falhou.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/prisma', () => ({
  prisma: {
    position: { findMany: jest.fn(), count: jest.fn() },
    order: { findMany: jest.fn() },
    adminMarketAction: { create: jest.fn().mockResolvedValue({}) },
  },
}))

const mockCloseShort = jest.fn()
const mockForceCloseLeveraged = jest.fn()
const mockCancelOrder = jest.fn()

jest.mock('@/lib/services/ShortService', () => ({ shortService: { closeShort: mockCloseShort } }))
jest.mock('@/lib/services/LeverageService', () => ({ leverageService: { forceCloseLeveraged: mockForceCloseLeveraged } }))
jest.mock('@/lib/services/OrderService', () => ({ orderService: { cancelOrder: mockCancelOrder } }))

// Import lazio (dentro do teste) para evitar TDZ: o `import` estático seria içado
// acima dos `const mock*`, disparando o factory antes da inicialização.
async function liquidateRestrictedPositions(...args: [string, string, string]) {
  const mod = await import('@/lib/services/forced-liquidation')
  return mod.liquidateRestrictedPositions(...args)
}

function shortPos(id: string) {
  return { id, side: 'SHORT', leverageMultiplier: 1, quantity: 10, asset: { ticker: 'FLA', currentPrice: 5 } }
}
function leveragedPos(id: string) {
  return { id, side: 'LONG', leverageMultiplier: 2, quantity: 4, asset: { ticker: 'PAL', currentPrice: 8 } }
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCloseShort.mockResolvedValue({ pnl: 0, transaction: {} })
  mockForceCloseLeveraged.mockResolvedValue(true)
  mockCancelOrder.mockResolvedValue({})
})

describe('FIX-08 — liquidateRestrictedPositions', () => {
  it('encerra SHORT + alavancada e cancela ordens OCO/SCHEDULED, retornando cleared=true', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.position.findMany.mockResolvedValue([shortPos('p-short'), leveragedPos('p-lev')])
    prisma.order.findMany.mockResolvedValue([{ id: 'o-oco' }])
    prisma.position.count.mockResolvedValue(0) // recontagem: nada sobrou

    const out = await liquidateRestrictedPositions('user-1', 'sub-1', 'REFUND_COOLING_OFF')

    expect(mockCloseShort).toHaveBeenCalledWith('user-1', 'p-short', 5, 'REFUND_COOLING_OFF')
    expect(mockForceCloseLeveraged).toHaveBeenCalledWith('p-lev', 8, 'REFUND_COOLING_OFF')
    expect(mockCancelOrder).toHaveBeenCalledWith('user-1', 'o-oco')
    expect(out.liquidated).toBe(3) // 2 posições + 1 ordem
    expect(out.failed).toBe(0)
    expect(out.remaining).toBe(0)
    expect(out.cleared).toBe(true)
  })

  it('cleared=false quando uma posição falha ao encerrar (failed>0), mesmo com recontagem zero', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.position.findMany.mockResolvedValue([shortPos('p-short')])
    prisma.order.findMany.mockResolvedValue([])
    prisma.position.count.mockResolvedValue(0)
    mockCloseShort.mockRejectedValueOnce(new Error('gateway down'))

    const out = await liquidateRestrictedPositions('user-1', 'sub-1', 'REFUND_COOLING_OFF')

    expect(out.failed).toBe(1)
    expect(out.liquidated).toBe(0)
    expect(out.cleared).toBe(false)
  })

  it('cleared=false quando ainda restam posições restritas abertas após a tentativa', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.position.findMany.mockResolvedValue([shortPos('p-short')])
    prisma.order.findMany.mockResolvedValue([])
    prisma.position.count.mockResolvedValue(1) // recontagem ainda achou 1 aberta

    const out = await liquidateRestrictedPositions('user-1', 'sub-1', 'REFUND_COOLING_OFF')

    expect(out.remaining).toBe(1)
    expect(out.cleared).toBe(false)
  })

  it('sem posições restritas nem ordens pendentes: found=0 e cleared=true (no-op seguro)', async () => {
    const { prisma } = require('@/lib/prisma')
    prisma.position.findMany.mockResolvedValue([])
    prisma.order.findMany.mockResolvedValue([])
    prisma.position.count.mockResolvedValue(0)

    const out = await liquidateRestrictedPositions('user-1', 'sub-1', 'REFUND_COMPLETED_WEBHOOK')

    expect(out.found).toBe(0)
    expect(mockCloseShort).not.toHaveBeenCalled()
    expect(out.cleared).toBe(true)
  })
})
