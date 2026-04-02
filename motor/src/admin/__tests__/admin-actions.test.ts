/**
 * @jest-environment node
 */
import { AdminMarketActions } from '../AdminMarketActions'
import type { AdminAction } from '../../types/motor.types'

const mockEngine = {
  pauseAsset: jest.fn(),
  resumeAsset: jest.fn(),
  injectNewsImpact: jest.fn(),
  adjustPrice: jest.fn(),
  haltAll: jest.fn().mockReturnValue(5),
  resumeAll: jest.fn().mockReturnValue(3),
}

const mockLogger = {
  log: jest.fn().mockResolvedValue(undefined),
}

const mockPrisma = {
  asset: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
}

describe('AdminMarketActions', () => {
  let actions: AdminMarketActions

  beforeEach(() => {
    jest.clearAllMocks()
    actions = new AdminMarketActions(
      mockEngine as any,
      mockLogger as any,
      mockPrisma as any
    )
  })

  test('PAUSE_ASSET chama engine.pauseAsset e registra log', async () => {
    const action: AdminAction = {
      type: 'PAUSE_ASSET',
      assetId: 'asset_001',
      payload: {},
      adminId: 'admin_001',
      reason: 'Teste de pausa',
      timestamp: Date.now(),
    }

    const result = await actions.handle(action)
    expect(result.success).toBe(true)
    expect(mockEngine.pauseAsset).toHaveBeenCalledWith('asset_001')
    expect(mockLogger.log).toHaveBeenCalledWith(action)
  })

  test('RESUME_ASSET chama engine.resumeAsset e registra log', async () => {
    const action: AdminAction = {
      type: 'RESUME_ASSET',
      assetId: 'asset_001',
      payload: {},
      adminId: 'admin_001',
      reason: 'Retomada do ativo',
      timestamp: Date.now(),
    }

    const result = await actions.handle(action)
    expect(result.success).toBe(true)
    expect(mockEngine.resumeAsset).toHaveBeenCalledWith('asset_001')
    expect(mockLogger.log).toHaveBeenCalledWith(action)
  })

  test('INJECT_NEWS com impacto POSITIVE usa magnitude positiva', async () => {
    const action: AdminAction = {
      type: 'INJECT_NEWS',
      assetId: 'asset_001',
      payload: { impact: 'POSITIVE', magnitude: 0.5, durationTicks: 10 },
      adminId: 'admin_001',
      reason: 'Notícia positiva de teste',
      timestamp: Date.now(),
    }

    const result = await actions.handle(action)
    expect(result.success).toBe(true)
    expect(mockEngine.injectNewsImpact).toHaveBeenCalledWith('asset_001', 0.5, 10)
  })

  test('INJECT_NEWS com impacto NEGATIVE usa magnitude negativa', async () => {
    const action: AdminAction = {
      type: 'INJECT_NEWS',
      assetId: 'asset_001',
      payload: { impact: 'NEGATIVE', magnitude: 0.3, durationTicks: 5 },
      adminId: 'admin_001',
      reason: 'Notícia negativa de teste',
      timestamp: Date.now(),
    }

    await actions.handle(action)
    expect(mockEngine.injectNewsImpact).toHaveBeenCalledWith('asset_001', -0.3, 5)
  })

  test('PAUSE_ASSET sem assetId retorna erro', async () => {
    const action: AdminAction = {
      type: 'PAUSE_ASSET',
      assetId: undefined,
      payload: {},
      adminId: 'admin_001',
      reason: 'Teste sem id',
      timestamp: Date.now(),
    }

    const result = await actions.handle(action)
    expect(result.success).toBe(false)
    expect(mockEngine.pauseAsset).not.toHaveBeenCalled()
  })

  test('HALT_ALL chama engine.haltAll e retorna contagem', async () => {
    const action: AdminAction = {
      type: 'HALT_ALL',
      assetId: undefined,
      payload: {},
      adminId: 'admin_001',
      reason: 'Paralisação de emergência',
      timestamp: Date.now(),
    }

    const result = await actions.handle(action)
    expect(result.success).toBe(true)
    expect(result.message).toContain('5')
    expect(mockEngine.haltAll).toHaveBeenCalled()
    expect(mockLogger.log).toHaveBeenCalledWith(action)
  })

  test('RESUME_ALL chama engine.resumeAll e retorna contagem', async () => {
    const action: AdminAction = {
      type: 'RESUME_ALL',
      assetId: undefined,
      payload: {},
      adminId: 'admin_001',
      reason: 'Retomada após emergência',
      timestamp: Date.now(),
    }

    const result = await actions.handle(action)
    expect(result.success).toBe(true)
    expect(result.message).toContain('3')
    expect(mockEngine.resumeAll).toHaveBeenCalled()
  })

  test('ADJUST_PRICE chama engine.adjustPrice com preço correto', async () => {
    const action: AdminAction = {
      type: 'ADJUST_PRICE',
      assetId: 'asset_001',
      payload: { newPrice: 35.00 },
      adminId: 'admin_001',
      reason: 'Ajuste manual de preço',
      timestamp: Date.now(),
    }

    // findUnique retorna null → previousPrice = undefined
    mockPrisma.asset.findUnique.mockResolvedValue(null)
    mockPrisma.asset.update.mockResolvedValue({})

    const result = await actions.handle(action)
    expect(result.success).toBe(true)
    expect(mockEngine.adjustPrice).toHaveBeenCalledWith('asset_001', 35.00)
    // log é chamado com (action, previousPrice, newPrice)
    expect(mockLogger.log).toHaveBeenCalledWith(action, undefined, 35)
  })

  test('ADJUST_PRICE sem assetId retorna erro', async () => {
    const action: AdminAction = {
      type: 'ADJUST_PRICE',
      assetId: undefined,
      payload: { newPrice: 25.00 },
      adminId: 'admin_001',
      reason: 'Ajuste sem ativo',
      timestamp: Date.now(),
    }

    const result = await actions.handle(action)
    expect(result.success).toBe(false)
    expect(mockEngine.adjustPrice).not.toHaveBeenCalled()
  })
})
