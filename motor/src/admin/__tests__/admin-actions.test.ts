/**
 * @jest-environment node
 */
import { AdminMarketActions } from '../AdminMarketActions'
import { AdminChannel } from '../../broadcast/AdminChannel'
import type { AdminAction } from '../../types/motor.types'

const mockEngine = {
  pauseAsset: jest.fn(),
  resumeAsset: jest.fn(),
  injectNewsImpact: jest.fn(),
  adjustPrice: jest.fn(),
  // Task 003: haltAll/resumeAll agora sao async e fazem a persistencia DB-first
  // internamente (caminho duravel centralizado no engine).
  haltAll: jest.fn().mockResolvedValue(5),
  resumeAll: jest.fn().mockResolvedValue(3),
}

const mockLogger = {
  log: jest.fn().mockResolvedValue(undefined),
}

const mockPrisma = {
  asset: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
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

  test('PAUSE_ASSET chama engine.pauseAsset, persiste DB e registra log', async () => {
    const action: AdminAction = {
      type: 'PAUSE_ASSET',
      assetId: 'asset_001',
      payload: {},
      adminId: 'admin_001',
      reason: 'Teste de pausa',
      timestamp: Date.now(),
    }

    mockPrisma.asset.update.mockResolvedValue({})

    const result = await actions.handle(action)
    expect(result.success).toBe(true)
    expect(mockEngine.pauseAsset).toHaveBeenCalledWith('asset_001', 'HALT_ASSET')
    expect(mockPrisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset_001' },
      data: { isHalted: true, haltReason: 'HALT_ASSET', haltedUntil: null },
    })
    expect(mockLogger.log).toHaveBeenCalledWith(action)
  })

  test('RESUME_ASSET persiste DB antes de retomar engine e registra log', async () => {
    const action: AdminAction = {
      type: 'RESUME_ASSET',
      assetId: 'asset_001',
      payload: {},
      adminId: 'admin_001',
      reason: 'Retomada do ativo',
      timestamp: Date.now(),
    }

    mockPrisma.asset.update.mockResolvedValue({})

    const result = await actions.handle(action)
    expect(result.success).toBe(true)
    expect(mockPrisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset_001' },
      data: { isHalted: false, haltReason: null, haltedUntil: null },
    })
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

  test('HALT_ALL delega a engine.haltAll (persistencia DB-first interna) e retorna contagem', async () => {
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
    // Task 003: a persistencia agora vive em engine.haltAll (DB-first); o handler
    // nao chama updateMany diretamente (evita double-write).
    expect(mockPrisma.asset.updateMany).not.toHaveBeenCalled()
    expect(mockLogger.log).toHaveBeenCalledWith(action)
  })

  test('RESUME_ALL delega a engine.resumeAll (retoma so admin, CB preservado) e retorna contagem', async () => {
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
    expect(mockPrisma.asset.updateMany).not.toHaveBeenCalled()
    expect(mockLogger.log).toHaveBeenCalledWith(action)
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
    // adjustPrice recebe metadados de auditoria (adminId, reason) como 3o argumento.
    expect(mockEngine.adjustPrice).toHaveBeenCalledWith('asset_001', 35.00, {
      adminId: 'admin_001',
      reason: 'Ajuste manual de preço',
    })
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

describe('AdminChannel — confirmação operacional de comandos globais', () => {
  const subscriber = {
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    on: jest.fn(),
  }
  const commandRedis = {
    set: jest.fn().mockResolvedValue('OK'),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockEngine.haltAll.mockResolvedValue(5)
    mockEngine.resumeAll.mockResolvedValue(3)
  })

  test('HALT_ALL registra consumed e applied com correlationId', async () => {
    const channel = new AdminChannel(subscriber as any, mockEngine as any, commandRedis as any)
    const event = {
      type: 'HALT_ALL',
      adminId: 'admin_001',
      reason: 'Paralisacao operacional planejada',
      correlationId: 'cmd-halt-1',
    }

    await (channel as any).handleControlMessage(JSON.stringify(event))

    expect(mockEngine.haltAll).toHaveBeenCalled()
    const statusWrites = commandRedis.set.mock.calls.filter(([key]) => key === 'motor:control:status:cmd-halt-1')
    expect(statusWrites).toHaveLength(2)
    expect(JSON.parse(statusWrites[0][1]).state).toBe('consumed')
    const applied = JSON.parse(statusWrites[1][1])
    expect(applied).toMatchObject({
      commandId: 'cmd-halt-1',
      type: 'HALT_ALL',
      state: 'applied',
      applied: true,
      success: true,
      count: 5,
    })
  })

  test('RESUME_ALL registra failed quando engine falha', async () => {
    mockEngine.resumeAll.mockRejectedValueOnce(new Error('db offline'))
    const channel = new AdminChannel(subscriber as any, mockEngine as any, commandRedis as any)
    const event = {
      type: 'RESUME_ALL',
      adminId: 'admin_001',
      reason: 'Retomada operacional planejada',
      correlationId: 'cmd-resume-1',
    }

    await (channel as any).handleControlMessage(JSON.stringify(event))

    const statusWrites = commandRedis.set.mock.calls.filter(([key]) => key === 'motor:control:status:cmd-resume-1')
    expect(statusWrites).toHaveLength(2)
    expect(JSON.parse(statusWrites[0][1]).state).toBe('consumed')
    const failed = JSON.parse(statusWrites[1][1])
    expect(failed).toMatchObject({
      commandId: 'cmd-resume-1',
      type: 'RESUME_ALL',
      state: 'failed',
      applied: false,
      success: false,
      error: 'db offline',
    })
  })
})
