// ============================================================================
// Testes unitários — NewsInjectionService
// Rastreabilidade: INT-049, task-005 (correcao ticker), QA gap G-05
// ============================================================================

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockNewsCreate = jest.fn()
const mockNewsUpdate = jest.fn()
const mockAssetFindUnique = jest.fn()
const mockSourceWhitelistFindFirst = jest.fn()
const mockAdminMarketActionCreate = jest.fn()
const mockAdminMarketActionUpdate = jest.fn()
const mockAdminMarketActionFindMany = jest.fn()
const mockRedisPublish = jest.fn()

// Grupo multi-time (M067): `writeNewsGroup` usa `$transaction(async tx => ...)`
// quando ha 2 ou 3 linhas. Os mocks do client TRANSACIONAL sao separados dos do
// client raiz de proposito: e a unica forma de uma assercao provar em QUAL
// fronteira cada escrita rodou. Reusar os mesmos mocks nos dois lados fazia o
// teste passar tanto com a auditoria dentro quanto fora da transacao.
const mockTxNewsCreate = jest.fn()
const mockTxNewsUpdate = jest.fn()
const mockTxAdminMarketActionCreate = jest.fn()

type StagedWrite = { model: 'news' | 'adminMarketAction'; op: 'create' | 'update'; args: unknown[] }

// Escritas que sobreviveram ao COMMIT. O fake respeita a semantica de
// `$transaction` interativa: o callback rejeitar significa que nada do que ele
// gravou entra aqui (rollback). Contagem de chamadas do mock nao prova isso — um
// INSERT revertido tambem "foi chamado" no banco real.
let committedWrites: StagedWrite[] = []

const mockTransaction = jest.fn(async (arg: unknown) => {
  if (typeof arg !== 'function') {
    return Promise.all(arg as unknown[])
  }
  const staged: StagedWrite[] = []
  const handlers: Record<string, jest.Mock> = {
    'news.create': mockTxNewsCreate,
    'news.update': mockTxNewsUpdate,
    'adminMarketAction.create': mockTxAdminMarketActionCreate,
  }
  const stage =
    (model: StagedWrite['model'], op: StagedWrite['op']) =>
    async (...args: unknown[]) => {
      staged.push({ model, op, args })
      return handlers[`${model}.${op}`](...args)
    }

  const result = await (arg as (tx: unknown) => Promise<unknown>)({
    news: { create: stage('news', 'create'), update: stage('news', 'update') },
    adminMarketAction: { create: stage('adminMarketAction', 'create') },
  })
  committedWrites.push(...staged)
  return result
})

jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: (...args: unknown[]) => mockAssetFindUnique(...args) },
    news: {
      create: (...args: unknown[]) => mockNewsCreate(...args),
      update: (...args: unknown[]) => mockNewsUpdate(...args),
    },
    newsSourceWhitelist: { findFirst: (...args: unknown[]) => mockSourceWhitelistFindFirst(...args) },
    adminMarketAction: {
      create: (...args: unknown[]) => mockAdminMarketActionCreate(...args),
      update: (...args: unknown[]) => mockAdminMarketActionUpdate(...args),
      findMany: (...args: unknown[]) => mockAdminMarketActionFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(args[0]),
  },
}))

jest.mock('@/lib/redis', () => ({
  redisPublisher: { publish: (...args: unknown[]) => mockRedisPublish(...args) },
  REDIS_CHANNELS: {
    NEWS_INJECT: 'news:inject',
    MOTOR_CONTROL: 'motor:control',
  },
}))

import {
  NewsInjectionService,
  adminNewsInjectSchema,
  NEWS_GROUP_MAX_ADDITIONAL_MSG,
  newsGroupDuplicateTickerMsg,
} from '@/lib/services/NewsInjectionService'
import type { AdminNewsInjectDTO } from '@/lib/services/NewsInjectionService'
import { writeNewsGroup } from '@/lib/services/newsGroupWriter'
import { ImpactCategory, Sentiment } from '@prisma/client'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ASSET_URU3 = { id: 'asset-uuid-fla', ticker: 'URU3' }
const ASSET_PAL3 = { id: 'asset-uuid-pal', ticker: 'PAL3' }
const ASSET_COR3 = { id: 'asset-uuid-cor', ticker: 'COR3' }

/** Resolve o asset por ticker, como o banco faria. */
const assetByTicker = (args: unknown): unknown => {
  const ticker = (args as { where: { ticker: string } }).where.ticker
  return { URU3: ASSET_URU3, PAL3: ASSET_PAL3, COR3: ASSET_COR3 }[ticker] ?? null
}

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
    committedWrites = []
    service = new NewsInjectionService()

    mockAssetFindUnique.mockResolvedValue(ASSET_URU3)
    mockSourceWhitelistFindFirst.mockResolvedValue(null)
    mockNewsCreate.mockResolvedValue({ id: 'news-uuid-001' })
    mockAdminMarketActionCreate.mockResolvedValue({ id: 'admin-action-001' })
    mockAdminMarketActionUpdate.mockResolvedValue({})
    mockAdminMarketActionFindMany.mockResolvedValue([])
    mockRedisPublish.mockResolvedValue(1)
  })

  // ─── Sucesso ─────────────────────────────────────────────────────────────

  test('[SUCCESS] grava ticker e assetIds sincronizados (ADR Opcao A)', async () => {
    const result = await service.inject(BASE_DTO, ADMIN_ID)

    // Retorno alargado pelo grupo M067: newsId continua sendo a ancora e, na
    // linha unica, groupId == newsId (trigger news_group_defaults_trg, DB-03).
    expect(result).toEqual({
      newsId: 'news-uuid-001',
      groupId: 'news-uuid-001',
      newsIds: ['news-uuid-001'],
    })
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

  test('[SUCCESS] marca auditoria como impacto aplicado apos publish no motor', async () => {
    await service.inject(BASE_DTO, ADMIN_ID)

    expect(mockAdminMarketActionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin-action-001' },
        data: expect.objectContaining({
          details: expect.objectContaining({
            newsId: 'news-uuid-001',
            correlationId: 'news-uuid-001',
            publishedImpactApplied: true,
            adminActionId: 'admin-action-001',
          }),
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

    expect(result).toEqual({
      newsId: 'news-uuid-001',
      groupId: 'news-uuid-001',
      newsIds: ['news-uuid-001'],
    })
    expect(mockAdminMarketActionCreate).toHaveBeenCalledTimes(1)
  })

  // ─── Nao-regressao de 1 par (criterio 17) ─────────────────────────────────

  test('[NO-REGRESSION] payload de 1 time nao usa transacao e correlaciona pelo proprio newsId', async () => {
    await service.inject(BASE_DTO, ADMIN_ID)

    // Linha unica nunca abre transacao e nunca manda group_id/group_rank: o
    // trigger news_group_defaults_trg preenche os dois (DB-03).
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockNewsUpdate).not.toHaveBeenCalled()
    expect(mockNewsCreate).toHaveBeenCalledTimes(1)
    const data = (mockNewsCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect('groupId' in data).toBe(false)
    expect('groupRank' in data).toBe(false)
    // Key-set INTEGRAL do payload, nao apenas ausencia dos dois campos novos:
    // qualquer campo extra (author, groupId, groupRank) e regressao de contrato
    // do caminho de 1 time, que precisa continuar identico ao anterior a M067.
    expect(Object.keys(data).sort()).toEqual([
      'assetIds',
      'content',
      'impact',
      'isPublished',
      'publishedAt',
      'sentiment',
      'source',
      'ticker',
      'title',
    ])

    // Linha unica audita pelo client RAIZ (fora de transacao). Se a auditoria
    // saisse pelo client transacional, o caminho de 1 time teria mudado.
    expect(mockAdminMarketActionCreate).toHaveBeenCalledTimes(1)
    expect(mockTxNewsCreate).not.toHaveBeenCalled()
    expect(mockTxNewsUpdate).not.toHaveBeenCalled()
    expect(mockTxAdminMarketActionCreate).not.toHaveBeenCalled()

    // Nos dois canais o correlationId e o proprio newsId, porque groupId == id.
    const payloads = mockRedisPublish.mock.calls.map((c: unknown[]) => JSON.parse(c[1] as string))
    expect(payloads).toHaveLength(2)
    expect(payloads.every((p) => p.correlationId === 'news-uuid-001')).toBe(true)
  })

  // ─── Grupo multi-time (M067) ──────────────────────────────────────────────

  describe('grupo multi-time', () => {
    beforeEach(() => {
      mockAssetFindUnique.mockImplementation(async (args: unknown) => assetByTicker(args))
      // Grupo escreve pelo client TRANSACIONAL: as linhas e as auditorias saem
      // pelos mocks `mockTx*`. Os mocks raiz ficam disponiveis de proposito, para
      // que um vazamento de escrita para fora da transacao apareca como falha.
      mockTxNewsCreate
        .mockResolvedValueOnce({ id: 'news-anchor' })
        .mockResolvedValueOnce({ id: 'news-sibling-1' })
        .mockResolvedValueOnce({ id: 'news-sibling-2' })
      mockTxNewsUpdate.mockResolvedValue({})
      mockTxAdminMarketActionCreate
        .mockResolvedValueOnce({ id: 'action-0' })
        .mockResolvedValueOnce({ id: 'action-1' })
        .mockResolvedValueOnce({ id: 'action-2' })
    })

    const GROUP_DTO: AdminNewsInjectDTO = {
      ...BASE_DTO,
      sentiment: 0.8,
      additionalTeams: [
        { ticker: 'PAL3', sentiment: -0.6 },
        { ticker: 'COR3', sentiment: 0.1 },
      ],
    }

    test('[GROUP] tres times → tres linhas irmas com group_id da ancora e ranks 0,1,2', async () => {
      const result = await service.inject(GROUP_DTO, ADMIN_ID)

      expect(result).toEqual({
        newsId: 'news-anchor',
        groupId: 'news-anchor',
        newsIds: ['news-anchor', 'news-sibling-1', 'news-sibling-2'],
      })
      expect(mockTxNewsCreate).toHaveBeenCalledTimes(3)
      // Nenhuma linha do grupo sai pelo client raiz.
      expect(mockNewsCreate).not.toHaveBeenCalled()

      // Ancora: groupRank explicito, groupId ainda nao (vem do update abaixo).
      expect(mockTxNewsCreate.mock.calls[0][0]).toMatchObject({
        data: { ticker: 'URU3', assetIds: ['asset-uuid-fla'], sentiment: 'BULLISH', groupRank: 0 },
      })
      expect(mockTxNewsUpdate).toHaveBeenCalledWith({
        where: { id: 'news-anchor' },
        data: { groupId: 'news-anchor' },
      })
      // Irmas: cada uma com seu proprio time e sentimento.
      expect(mockTxNewsCreate.mock.calls[1][0]).toMatchObject({
        data: { ticker: 'PAL3', assetIds: ['asset-uuid-pal'], sentiment: 'BEARISH', groupId: 'news-anchor', groupRank: 1 },
      })
      expect(mockTxNewsCreate.mock.calls[2][0]).toMatchObject({
        data: { ticker: 'COR3', assetIds: ['asset-uuid-cor'], sentiment: 'NEUTRAL', groupId: 'news-anchor', groupRank: 2 },
      })
    })

    test('[GROUP] titulo, conteudo, impacto e publishedAt sao identicos nas tres linhas', async () => {
      await service.inject(GROUP_DTO, ADMIN_ID)

      const datas = mockTxNewsCreate.mock.calls.map((call: unknown[]) => (call[0] as { data: Record<string, unknown> }).data)
      for (const data of datas.slice(1)) {
        expect(data.title).toBe(datas[0].title)
        expect(data.content).toBe(datas[0].content)
        expect(data.impact).toBe(datas[0].impact)
        expect(data.source).toBe(datas[0].source)
        // MESMA instancia de Date: empate de publishedAt entre irmas seria
        // ordenacao instavel no feed.
        expect(data.publishedAt).toBe(datas[0].publishedAt)
      }
    })

    test('[GROUP] escreve o grupo dentro de uma transacao (nenhum grupo parcial)', async () => {
      await service.inject(GROUP_DTO, ADMIN_ID)

      expect(mockTransaction).toHaveBeenCalledTimes(1)
      expect(typeof mockTransaction.mock.calls[0][0]).toBe('function')
      // Commit unico com TODAS as escritas do fato: 3 linhas + o update de
      // groupId da ancora + 3 auditorias.
      expect(committedWrites.map((w) => `${w.model}.${w.op}`)).toEqual([
        'news.create',
        'news.update',
        'news.create',
        'news.create',
        'adminMarketAction.create',
        'adminMarketAction.create',
        'adminMarketAction.create',
      ])
    })

    test('[GROUP] auditoria e gravada DENTRO da transacao das linhas, nao depois do commit', async () => {
      await service.inject(GROUP_DTO, ADMIN_ID)

      // Auditoria fora da transacao era o buraco real: falha no meio do loop
      // deixava prefixo auditado + irmas sem acao nenhuma, e o reconcile (que so
      // varre acoes existentes) nunca encontrava essas irmas.
      expect(mockTxAdminMarketActionCreate).toHaveBeenCalledTimes(3)
      expect(mockAdminMarketActionCreate).not.toHaveBeenCalled()
    })

    test('[GROUP] uma auditoria POR LINHA, todas com correlationId = groupId', async () => {
      await service.inject(GROUP_DTO, ADMIN_ID)

      expect(mockTxAdminMarketActionCreate).toHaveBeenCalledTimes(3)
      const details = mockTxAdminMarketActionCreate.mock.calls.map(
        (call: unknown[]) => (call[0] as { data: { details: Record<string, unknown> } }).data.details
      )
      expect(details.map((d) => d.correlationId)).toEqual(['news-anchor', 'news-anchor', 'news-anchor'])
      expect(details.map((d) => d.newsId)).toEqual(['news-anchor', 'news-sibling-1', 'news-sibling-2'])
      expect(details.map((d) => d.groupRank)).toEqual([0, 1, 2])
      expect(details.map((d) => d.sentiment)).toEqual([0.8, -0.6, 0.1])
      // Estado de despacho por canal nasce pendente nos dois.
      expect(details.map((d) => d.publishedImpactApplied)).toEqual([false, false, false])
      expect(details.map((d) => d.newsInjectPublished)).toEqual([false, false, false])
      // assetId por linha: o motor indexa por UUID do ativo daquele time.
      const assetIds = mockTxAdminMarketActionCreate.mock.calls.map(
        (call: unknown[]) => (call[0] as { data: { assetId: string } }).data.assetId
      )
      expect(assetIds).toEqual(['asset-uuid-fla', 'asset-uuid-pal', 'asset-uuid-cor'])
    })

    test('[GROUP] falha na SEGUNDA linha reverte o grupo inteiro e nao publica nada', async () => {
      mockTxNewsCreate.mockReset()
      mockTxNewsCreate
        .mockResolvedValueOnce({ id: 'news-anchor' })
        .mockRejectedValueOnce(new Error('P2002 unique violation'))

      await expect(service.inject(GROUP_DTO, ADMIN_ID)).rejects.toThrow('P2002 unique violation')

      // Rollback: a ancora ja tinha sido inserida, mas nada commitou.
      expect(committedWrites).toHaveLength(0)
      // Nem auditoria, nem evento: o motor nao ve um fato pela metade.
      expect(mockTxAdminMarketActionCreate).not.toHaveBeenCalled()
      expect(mockAdminMarketActionCreate).not.toHaveBeenCalled()
      expect(mockRedisPublish).not.toHaveBeenCalled()
    })

    test('[GROUP] falha na auditoria da segunda linha reverte as linhas ja gravadas', async () => {
      mockTxAdminMarketActionCreate.mockReset()
      mockTxAdminMarketActionCreate
        .mockResolvedValueOnce({ id: 'action-0' })
        .mockRejectedValueOnce(new Error('auditoria indisponivel'))

      await expect(service.inject(GROUP_DTO, ADMIN_ID)).rejects.toThrow('auditoria indisponivel')

      // As 3 linhas E a primeira auditoria voltam junto: nao existe grupo
      // gravado com auditoria pela metade.
      expect(committedWrites).toHaveLength(0)
      expect(mockTxNewsCreate).toHaveBeenCalledTimes(3)
      expect(mockRedisPublish).not.toHaveBeenCalled()
    })

    test('[GROUP] publica news:inject e motor:control uma vez por linha, com correlationId do grupo', async () => {
      await service.inject(GROUP_DTO, ADMIN_ID)

      const newsInjectCalls = mockRedisPublish.mock.calls.filter((c: unknown[]) => c[0] === 'news:inject')
      const motorCalls = mockRedisPublish.mock.calls.filter((c: unknown[]) => c[0] === 'motor:control')
      expect(newsInjectCalls).toHaveLength(3)
      expect(motorCalls).toHaveLength(3)

      const injectPayloads = newsInjectCalls.map((c: unknown[]) => JSON.parse(c[1] as string))
      expect(injectPayloads.map((p) => p.ticker)).toEqual(['URU3', 'PAL3', 'COR3'])
      expect(injectPayloads.every((p) => p.correlationId === 'news-anchor')).toBe(true)

      const motorPayloads = motorCalls.map((c: unknown[]) => JSON.parse(c[1] as string))
      expect(motorPayloads.map((p) => p.assetId)).toEqual(['asset-uuid-fla', 'asset-uuid-pal', 'asset-uuid-cor'])
      // Sentimento negativo da linha 2 vira impacto NEGATIVE somente nela.
      expect(motorPayloads.map((p) => p.payload.impact)).toEqual(['POSITIVE', 'NEGATIVE', 'POSITIVE'])
    })

    test('[GROUP] ticker inexistente em time adicional aborta ANTES de qualquer escrita', async () => {
      mockAssetFindUnique.mockImplementation(async (args: unknown) => {
        const ticker = (args as { where: { ticker: string } }).where.ticker
        return ticker === 'URU3' ? ASSET_URU3 : null
      })

      await expect(
        service.inject({ ...BASE_DTO, additionalTeams: [{ ticker: 'PAL3', sentiment: -0.6 }] }, ADMIN_ID)
      ).rejects.toThrow('Ativo não encontrado: PAL3')

      // Nenhuma linha gravada: grupo parcial nunca chega ao feed nem ao motor.
      expect(mockNewsCreate).not.toHaveBeenCalled()
      expect(mockTxNewsCreate).not.toHaveBeenCalled()
      expect(mockTransaction).not.toHaveBeenCalled()
      expect(mockRedisPublish).not.toHaveBeenCalled()
    })

    test('[GROUP] falha do motor:control em UMA linha nao interrompe as outras', async () => {
      // 1a linha: news:inject ok, motor:control falha. Demais publicam normal.
      mockRedisPublish
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('Redis motor:control timeout'))
        .mockResolvedValue(1)

      const result = await service.inject(GROUP_DTO, ADMIN_ID)

      expect(result.newsIds).toHaveLength(3)
      // As 3 auditorias existem (commitadas com as linhas) e as 3 registram o
      // resultado do despacho — a 1a com o motor pendente, para o reconcile.
      expect(mockTxAdminMarketActionCreate).toHaveBeenCalledTimes(3)
      expect(mockAdminMarketActionUpdate).toHaveBeenCalledTimes(3)
      const dispatched = mockAdminMarketActionUpdate.mock.calls.map(
        (call: unknown[]) => (call[0] as { data: { details: Record<string, unknown> } }).data.details
      )
      expect(dispatched.map((d) => d.publishedImpactApplied)).toEqual([false, true, true])
      expect(dispatched.map((d) => d.newsInjectPublished)).toEqual([true, true, true])
    })

    test('[GROUP] falha do news:inject em UMA linha nao interrompe as outras nem o motor', async () => {
      // 1a linha: news:inject falha. O motor:control DA MESMA linha ainda e
      // tentado (e o canal que aplica preco), e as irmas seguem intactas.
      mockRedisPublish.mockRejectedValueOnce(new Error('Redis news:inject timeout')).mockResolvedValue(1)

      const result = await service.inject(GROUP_DTO, ADMIN_ID)

      expect(result.newsIds).toHaveLength(3)
      const newsInjectCalls = mockRedisPublish.mock.calls.filter((c: unknown[]) => c[0] === 'news:inject')
      const motorCalls = mockRedisPublish.mock.calls.filter((c: unknown[]) => c[0] === 'motor:control')
      expect(newsInjectCalls).toHaveLength(3)
      expect(motorCalls).toHaveLength(3)

      const dispatched = mockAdminMarketActionUpdate.mock.calls.map(
        (call: unknown[]) => (call[0] as { data: { details: Record<string, unknown> } }).data.details
      )
      // So a 1a linha fica com o canal de feed pendente; o reconcile republica
      // esse canal sem reemitir o motor:control que ja foi aplicado.
      expect(dispatched.map((d) => d.newsInjectPublished)).toEqual([false, true, true])
      expect(dispatched.map((d) => d.publishedImpactApplied)).toEqual([true, true, true])
    })

    test('[GROUP] falha nos DOIS canais de uma linha nao gasta UPDATE nem derruba as irmas', async () => {
      mockRedisPublish
        .mockRejectedValueOnce(new Error('news:inject down'))
        .mockRejectedValueOnce(new Error('motor:control down'))
        .mockResolvedValue(1)

      const result = await service.inject(GROUP_DTO, ADMIN_ID)

      expect(result.newsIds).toHaveLength(3)
      // A 1a linha ja esta no estado correto desde o INSERT (ambos false), entao
      // nao ha UPDATE para ela: so as duas irmas atualizam.
      expect(mockAdminMarketActionUpdate).toHaveBeenCalledTimes(2)
      const ids = mockAdminMarketActionUpdate.mock.calls.map(
        (call: unknown[]) => (call[0] as { where: { id: string } }).where.id
      )
      expect(ids).toEqual(['action-1', 'action-2'])
    })
  })

  // ─── Schema do grupo ──────────────────────────────────────────────────────

  describe('adminNewsInjectSchema — grupo', () => {
    const VALID_BODY = {
      title: 'Transferencia entre times',
      content: 'Jogador troca de clube.',
      ticker: 'URU3',
      impactCategory: ImpactCategory.ESPORTIVA_MAJORITARIA,
      sentiment: 0.5,
    }

    test('[SCHEMA] aceita ausencia de additionalTeams (linha unica)', () => {
      const parsed = adminNewsInjectSchema.safeParse(VALID_BODY)
      expect(parsed.success).toBe(true)
    })

    test('[SCHEMA] aceita 2 times adicionais e faz upper-case dos tickers', () => {
      const parsed = adminNewsInjectSchema.safeParse({
        ...VALID_BODY,
        additionalTeams: [
          { ticker: 'pal3', sentiment: -0.6 },
          { ticker: 'cor3', sentiment: 0 },
        ],
      })
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.additionalTeams?.map((t) => t.ticker)).toEqual(['PAL3', 'COR3'])
      }
    })

    test('[SCHEMA] rejeita 3 times adicionais (cap de 3 linhas por grupo)', () => {
      const parsed = adminNewsInjectSchema.safeParse({
        ...VALID_BODY,
        additionalTeams: [
          { ticker: 'PAL3', sentiment: -0.6 },
          { ticker: 'COR3', sentiment: 0 },
          { ticker: 'SAN3', sentiment: 0.2 },
        ],
      })
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error.issues.some((i) => i.message === NEWS_GROUP_MAX_ADDITIONAL_MSG)).toBe(true)
      }
    })

    test('[SCHEMA] rejeita ticker repetido — inclusive igual ao principal', () => {
      const vsPrincipal = adminNewsInjectSchema.safeParse({
        ...VALID_BODY,
        additionalTeams: [{ ticker: 'uru3', sentiment: -0.6 }],
      })
      expect(vsPrincipal.success).toBe(false)
      if (!vsPrincipal.success) {
        expect(vsPrincipal.error.issues[0].message).toBe(newsGroupDuplicateTickerMsg('URU3'))
      }

      const entreIrmaos = adminNewsInjectSchema.safeParse({
        ...VALID_BODY,
        additionalTeams: [
          { ticker: 'PAL3', sentiment: -0.6 },
          { ticker: 'PAL3', sentiment: 0.2 },
        ],
      })
      expect(entreIrmaos.success).toBe(false)
    })

    test('[SCHEMA] rejeita time adicional sem ticker', () => {
      const parsed = adminNewsInjectSchema.safeParse({
        ...VALID_BODY,
        additionalTeams: [{ ticker: '', sentiment: -0.6 }],
      })
      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toBe('Ticker do time adicional é obrigatório.')
      }
    })
  })

  test('[RECONCILE] republica noticias salvas sem impacto aplicado e atualiza auditoria', async () => {
    mockAdminMarketActionFindMany.mockResolvedValue([
      {
        id: 'admin-action-002',
        assetId: 'asset-uuid-fla',
        ticker: 'URU3',
        details: {
          newsId: 'news-uuid-002',
          correlationId: 'news-uuid-002',
          publishedImpactApplied: false,
          title: 'Noticia perdida no Redis',
          source: 'Admin',
          impactCategory: ImpactCategory.ESPORTIVA_MAJORITARIA,
          sentiment: -0.7,
          publishedAt: '2026-06-06T12:00:00.000Z',
        },
      },
    ])

    const result = await service.reconcileUnappliedNews()

    expect(result).toMatchObject({ checked: 1, reapplied: 1, failed: 0, unapplied: 0 })
    const motorCalls = mockRedisPublish.mock.calls.filter((c: unknown[]) => c[0] === 'motor:control')
    expect(motorCalls).toHaveLength(1)
    const payload = JSON.parse(motorCalls[0][1] as string)
    expect(payload).toMatchObject({
      type: 'INJECT_NEWS',
      assetId: 'asset-uuid-fla',
      correlationId: 'news-uuid-002',
      payload: expect.objectContaining({
        impact: 'NEGATIVE',
        newsId: 'news-uuid-002',
        adminActionId: 'admin-action-002',
      }),
    })
    expect(mockAdminMarketActionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin-action-002' },
        data: expect.objectContaining({
          details: expect.objectContaining({ publishedImpactApplied: true }),
        }),
      })
    )
  })

  test('[RECONCILE] linha legacy (sem newsInjectPublished) republica SO o motor e nao inventa o flag', async () => {
    // Pre-M067 nao existia flag de canal de feed. Republicar `news:inject` para
    // essa linha seria inventar historico: ela pode ter publicado normalmente.
    mockAdminMarketActionFindMany.mockResolvedValue([
      {
        id: 'admin-action-legacy',
        assetId: 'asset-uuid-fla',
        ticker: 'URU3',
        details: {
          newsId: 'news-legacy',
          correlationId: 'news-legacy',
          publishedImpactApplied: false,
          title: 'Noticia legacy',
          source: 'Admin',
          impactCategory: ImpactCategory.ESPORTIVA_MAJORITARIA,
          sentiment: -0.5,
          publishedAt: '2026-06-06T12:00:00.000Z',
        },
      },
    ])

    const result = await service.reconcileUnappliedNews()

    expect(result).toMatchObject({ checked: 1, reapplied: 1, failed: 0 })
    const channels = mockRedisPublish.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toEqual(['motor:control'])

    const details = (
      mockAdminMarketActionUpdate.mock.calls[0][0] as { data: { details: Record<string, unknown> } }
    ).data.details
    expect(details.publishedImpactApplied).toBe(true)
    expect('newsInjectPublished' in details).toBe(false)
  })

  test('[RECONCILE] pendencia so no news:inject republica SO esse canal e fecha os dois flags', async () => {
    mockAdminMarketActionFindMany.mockResolvedValue([
      {
        id: 'admin-action-feed',
        assetId: 'asset-uuid-fla',
        ticker: 'URU3',
        details: {
          newsId: 'news-feed',
          correlationId: 'group-feed',
          groupId: 'group-feed',
          groupRank: 1,
          publishedImpactApplied: true,
          newsInjectPublished: false,
          title: 'Motor aplicou, feed nao',
          source: 'Admin',
          impactCategory: ImpactCategory.ESPORTIVA_MAJORITARIA,
          sentiment: 0.6,
          publishedAt: '2026-06-06T12:00:00.000Z',
        },
      },
    ])

    const result = await service.reconcileUnappliedNews()

    expect(result).toMatchObject({ checked: 1, reapplied: 1, failed: 0 })
    // O motor NAO e reemitido: o impacto ja foi aplicado e um segundo evento
    // seria despacho as cegas.
    const channels = mockRedisPublish.mock.calls.map((c: unknown[]) => c[0])
    expect(channels).toEqual(['news:inject'])
    const payload = JSON.parse(mockRedisPublish.mock.calls[0][1] as string)
    expect(payload).toMatchObject({
      type: 'NEWS',
      // O motor resolve ticker -> UUID em handleNewsInject; o canal de feed
      // trafega ticker, nao o UUID do asset.
      assetId: 'URU3',
      ticker: 'URU3',
      newsId: 'news-feed',
      correlationId: 'group-feed',
    })

    const details = (
      mockAdminMarketActionUpdate.mock.calls[0][0] as { data: { details: Record<string, unknown> } }
    ).data.details
    expect(details).toMatchObject({ publishedImpactApplied: true, newsInjectPublished: true })
    // Campos de identidade do grupo preservados no merge.
    expect(details).toMatchObject({ groupId: 'group-feed', groupRank: 1 })
  })

  // ─── Guarda de ranks do writeNewsGroup ────────────────────────────────────
  // O CHECK DB-04 so restringe a faixa (BETWEEN 0 AND 2): nao exige unicidade
  // nem a presenca da ancora. Grupo sem `rank 0` nasce invisivel para o GET do
  // admin (que filtra `groupRank: 0`) — grupo parcial por outra porta.

  describe('writeNewsGroup — guarda de ranks', () => {
    const SHARED = {
      title: 'Guarda de ranks',
      content: '',
      impact: ImpactCategory.ESPORTIVA_MAJORITARIA,
      source: 'Admin',
      isPublished: true,
      publishedAt: new Date('2026-06-06T12:00:00.000Z'),
    }
    const row = (rank: number) => ({
      ticker: `T${rank}`,
      sentiment: Sentiment.NEUTRAL,
      assetIds: [`asset-${rank}`],
      rank,
    })

    test('[GUARD] grupo sem linha de rank 0 e rejeitado antes de qualquer escrita', async () => {
      await expect(writeNewsGroup([row(1), row(2)], SHARED)).rejects.toThrow('grupo sem ancora')
      expect(mockTransaction).not.toHaveBeenCalled()
      expect(mockNewsCreate).not.toHaveBeenCalled()
      expect(mockTxNewsCreate).not.toHaveBeenCalled()
    })

    test('[GUARD] ranks duplicados sao rejeitados (DB-04 nao impoe unicidade)', async () => {
      await expect(writeNewsGroup([row(0), { ...row(1), rank: 0 }], SHARED)).rejects.toThrow(
        'ranks duplicados'
      )
      expect(mockTransaction).not.toHaveBeenCalled()
      expect(mockNewsCreate).not.toHaveBeenCalled()
    })

    test('[GUARD] rank fora da faixa 0..2 e rejeitado', async () => {
      await expect(writeNewsGroup([row(0), row(3)], SHARED)).rejects.toThrow('rank invalido 3')
      await expect(writeNewsGroup([{ ...row(0), rank: -1 }], SHARED)).rejects.toThrow(
        'rank invalido -1'
      )
      expect(mockNewsCreate).not.toHaveBeenCalled()
    })
  })

  test('[RECONCILE] varredura descobre pendencia em QUALQUER um dos dois canais', async () => {
    mockAdminMarketActionFindMany.mockResolvedValue([])

    await service.reconcileUnappliedNews()

    const where = (mockAdminMarketActionFindMany.mock.calls[0][0] as { where: Record<string, unknown> })
      .where
    expect(where).toMatchObject({
      action: 'NEWS_INJECT',
      OR: [
        { details: { path: ['publishedImpactApplied'], equals: false } },
        { details: { path: ['newsInjectPublished'], equals: false } },
      ],
    })
  })
})
