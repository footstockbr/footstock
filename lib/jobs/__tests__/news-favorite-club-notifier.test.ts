// ============================================================================
// Foot Stock — Testes unitários: NewsFavoriteClubNotifier
// Cobre: notificação de clube favorito via news:inject Redis channel.
// Rastreabilidade: module-19 TASK-6 ST004, GAP-015 (module-17)
// ============================================================================

import { handleNewsEvent } from '../news-favorite-club-notifier'
import { prisma } from '@/lib/prisma'
import { sendNotification } from '@/lib/services/NotificationService'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: {
      findUnique: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/NotificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined),
}))

// Subscriber não é testado em unit tests (depende de ioredis conectado)
jest.mock('@/lib/redis', () => ({
  createSubscriber: jest.fn().mockReturnValue({
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  }),
  REDIS_CHANNELS: {
    NEWS_INJECT: 'news:inject',
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAsset = { clubSlug: 'flamengo' }
const mockUsers = [{ id: 'user-1' }, { id: 'user-2' }]

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendNotification = sendNotification as jest.Mock

function makeEvent(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: 'NEWS',
    assetId: 'FLM',
    impact: 'POSITIVE',
    magnitude: 0.75,
    durationTicks: 3,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('handleNewsEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // [SUCCESS] — fluxo principal
  it('deve disparar notificação para 2 usuários com FLM como clube favorito', async () => {
    ;(mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(mockAsset)
    ;(mockPrisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers)

    await handleNewsEvent(makeEvent())

    expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({
      where: { ticker: 'FLM' },
      select: { clubSlug: true, ticker: true },
    })
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true },
      })
    )
    expect(mockSendNotification).toHaveBeenCalledTimes(2)
    expect(mockSendNotification).toHaveBeenCalledWith('user-1', 'NEWS_FAVORITE_CLUB', {
      ticker: 'FLM',
      clubSlug: 'flamengo',
      impact: 'POSITIVE',
      magnitude: 0.75,
    })
    expect(mockSendNotification).toHaveBeenCalledWith('user-2', 'NEWS_FAVORITE_CLUB', {
      ticker: 'FLM',
      clubSlug: 'flamengo',
      impact: 'POSITIVE',
      magnitude: 0.75,
    })
  })

  // [EDGE] — ticker desconhecido no DB
  it('não deve disparar notificações se o asset não for encontrado no DB', async () => {
    ;(mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(null)

    await handleNewsEvent(makeEvent({ assetId: 'TICKER_INVALIDO' }))

    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  // [EDGE] — nenhum usuário com o clube como favorito
  it('não deve disparar notificações se nenhum usuário tem o clube como favorito', async () => {
    ;(mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(mockAsset)
    ;(mockPrisma.user.findMany as jest.Mock).mockResolvedValue([])

    await handleNewsEvent(makeEvent())

    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  // [ERROR] — JSON malformado
  it('deve absorver erro silenciosamente ao receber JSON inválido', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await handleNewsEvent('{ invalido json }')

    expect(mockPrisma.asset.findUnique).not.toHaveBeenCalled()
    expect(mockSendNotification).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  // [EDGE] — evento sem assetId
  it('deve retornar imediatamente se o evento não tiver assetId', async () => {
    await handleNewsEvent(makeEvent({ assetId: undefined }))

    expect(mockPrisma.asset.findUnique).not.toHaveBeenCalled()
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  // [DEGRADED] — sendNotification falha para 1 de 3 usuários
  it('deve notificar os demais usuários mesmo se sendNotification falhar para um', async () => {
    const threeUsers = [{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }]
    ;(mockPrisma.asset.findUnique as jest.Mock).mockResolvedValue(mockAsset)
    ;(mockPrisma.user.findMany as jest.Mock).mockResolvedValue(threeUsers)

    // user-2 falha
    mockSendNotification
      .mockResolvedValueOnce(undefined)         // user-1: OK
      .mockRejectedValueOnce(new Error('DB timeout')) // user-2: FALHA
      .mockResolvedValueOnce(undefined)         // user-3: OK

    // não deve lançar exceção
    await expect(handleNewsEvent(makeEvent())).resolves.toBeUndefined()
    expect(mockSendNotification).toHaveBeenCalledTimes(3)
  })
})
