// ============================================================================
// Testes unitários — NewsInjectionService
// Rastreabilidade: INT-049, task-005 (correcao ticker), QA gap G-05
// ============================================================================

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockNewsCreate = jest.fn()
const mockAssetFindUnique = jest.fn()
const mockSourceWhitelistFindFirst = jest.fn()
const mockAdminMarketActionCreate = jest.fn()
const mockRedisPublish = jest.fn()

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: (...args: unknown[]) => mockAssetFindUnique(...args) },
    news: { create: (...args: unknown[]) => mockNewsCreate(...args) },
    newsSourceWhitelist: { findFirst: (...args: unknown[]) => mockSourceWhitelistFindFirst(...args) },
    adminMarketAction: { create: (...args: unknown[]) => mockAdminMarketActionCreate(...args) },
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: { publish: (...args: unknown[]) => mockRedisPublish(...args) },
  REDIS_CHANNELS: {
    NEWS_INJECT: 'news:inject',
    MOTOR_CONTROL: 'motor:control',
  },
}))

import { NewsInjectionService } from '@/lib/services/NewsInjectionService'
import type { AdminNewsInjectDTO } from '@/lib/services/NewsInjectionService'
import { ImpactCategory } from '@prisma/client'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ASSET_URU3 = { id: 'asset-uuid-fla', ticker: 'URU3' }

const BASE_DTO: AdminNewsInjectDTO = {
  title: 'Flamengo vence campeonato',
  content: 'Vitória importante para a temporada.',
  ticker: 'URU3',
  impactCategory: ImpactCategory.ESPORTIVA_MAJORITARIA,
  sentiment: 0.8,
  source: 'Admin',
}

const ADMIN_ID = 'admin-user-001'

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('NewsInjectionService', () => {
  let service: NewsInjectionService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new NewsInjectionService()

    mockAssetFindUnique.mockResolvedValue(ASSET_URU3)
    mockSourceWhitelistFindFirst.mockResolvedValue(null)
    mockNewsCreate.mockResolvedValue({ id: 'news-uuid-001' })
    mockAdminMarketActionCreate.mockResolvedValue({})
    mockRedisPublish.mockResolvedValue(1)
  })

  // ─── Sucesso ─────────────────────────────────────────────────────────────

  test('[SUCCESS] grava ticker e assetIds sincronizados (ADR Opcao A)', async () => {
    const result = await service.inject(BASE_DTO, ADMIN_ID)

    expect(result).toEqual({ newsId: 'news-uuid-001' })
    expect(mockNewsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticker: 'URU3',
          assetIds: ['asset-uuid-fla'],
        }),
      })
    )
  })

  test('[SUCCESS] publica no canal news:inject com campos corretos', async () => {
    await service.inject(BASE_DTO, ADMIN_ID)

    const newsInjectCalls = mockRedisPublish.mock.calls.filter(
      (c: unknown[]) => c[0] === 'news:inject'
    )
    expect(newsInjectCalls).toHaveLength(1)
    const payload = JSON.parse(newsInjectCalls[0][1] as string)
    expect(payload).toMatchObject({
      ticker: 'URU3',
      title: BASE_DTO.title,
      sentiment: BASE_DTO.sentiment,
      impactCategory: BASE_DTO.impactCategory,
    })
  })

  test('[SUCCESS] publica no canal motor:control com assetId UUID (nao ticker string)', async () => {
    await service.inject(BASE_DTO, ADMIN_ID)

    const motorCalls = mockRedisPublish.mock.calls.filter(
      (c: unknown[]) => c[0] === 'motor:control'
    )
    expect(motorCalls).toHaveLength(1)
    const payload = JSON.parse(motorCalls[0][1] as string)
    expect(payload.assetId).toBe('asset-uuid-fla')
    expect(payload.type).toBe('INJECT_NEWS')
  })

  test('[SUCCESS] cria registro de auditoria com ticker e action NEWS_INJECT', async () => {
    await service.inject(BASE_DTO, ADMIN_ID)

    expect(mockAdminMarketActionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminId: ADMIN_ID,
          ticker: 'URU3',
          action: 'NEWS_INJECT',
        }),
      })
    )
  })

  // ─── Mapeamento de sentimento ─────────────────────────────────────────────

  test('[SENTIMENT] > 0.3 → BULLISH', async () => {
    await service.inject({ ...BASE_DTO, sentiment: 0.5 }, ADMIN_ID)
    expect(mockNewsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sentiment: 'BULLISH' }) })
    )
  })

  test('[SENTIMENT] < -0.3 → BEARISH', async () => {
    await service.inject({ ...BASE_DTO, sentiment: -0.5 }, ADMIN_ID)
    expect(mockNewsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sentiment: 'BEARISH' }) })
    )
  })

  test('[SENTIMENT] entre -0.3 e 0.3 → NEUTRAL', async () => {
    await service.inject({ ...BASE_DTO, sentiment: 0.1 }, ADMIN_ID)
    expect(mockNewsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sentiment: 'NEUTRAL' }) })
    )
  })

  // ─── Whitelist de fontes ──────────────────────────────────────────────────

  test('[WHITELIST] fonte whitelistada dobra magnitude no motor:control', async () => {
    mockSourceWhitelistFindFirst.mockResolvedValue({ domain: 'espnbrasil.com' })

    await service.inject({ ...BASE_DTO, source: 'https://espnbrasil.com/noticia' }, ADMIN_ID)

    const motorCalls = mockRedisPublish.mock.calls.filter(
      (c: unknown[]) => c[0] === 'motor:control'
    )
    const payload = JSON.parse(motorCalls[0][1] as string)
    // sentiment 0.8 * multiplier 2, capped at 1
    expect(payload.payload.magnitude).toBe(1)
  })

  test('[WHITELIST] fonte nao whitelistada mantem magnitude normal', async () => {
    mockSourceWhitelistFindFirst.mockResolvedValue(null)

    await service.inject({ ...BASE_DTO, source: 'https://desconhecido.com/noticia', sentiment: 0.5 }, ADMIN_ID)

    const motorCalls = mockRedisPublish.mock.calls.filter(
      (c: unknown[]) => c[0] === 'motor:control'
    )
    const payload = JSON.parse(motorCalls[0][1] as string)
    expect(payload.payload.magnitude).toBeCloseTo(0.5)
  })

  // ─── Erros de asset ───────────────────────────────────────────────────────

  test('[ERROR] ativo nao encontrado → lanca excecao sem criar news', async () => {
    mockAssetFindUnique.mockResolvedValue(null)

    await expect(service.inject(BASE_DTO, ADMIN_ID)).rejects.toThrow('Ativo não encontrado: URU3')
    expect(mockNewsCreate).not.toHaveBeenCalled()
  })

  // ─── Resiliencia de infra ─────────────────────────────────────────────────

  test('[RESILIENCE] falha no motor:control nao propaga — news e auditoria preservados', async () => {
    // Primeiro publish (news:inject) sucede, segundo (motor:control) falha
    mockRedisPublish
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('Redis motor:control timeout'))

    const result = await service.inject(BASE_DTO, ADMIN_ID)

    expect(result).toEqual({ newsId: 'news-uuid-001' })
    expect(mockAdminMarketActionCreate).toHaveBeenCalledTimes(1)
  })
})
