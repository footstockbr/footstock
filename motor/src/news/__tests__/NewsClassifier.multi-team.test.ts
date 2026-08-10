// ============================================================================
// Testes — NewsClassifier multi-time (item 011, loop
// 07-28-noticias-multi-time-linha-por-time)
//
// Cobre o contrato de saída `ClassifiedNews.teams[]` e a ORDEM OBRIGATÓRIA do
// pipeline de seleção do parser:
//   1) dedup por ticker  2) política de confidence  3) corte para 3  4) rank
//
// O golden set de acerto de sinal (critério 31, >= 85% em 30+ manchetes) é do
// item 012 e NÃO é medido aqui: o aceite deste item é o shape.
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { NewsClassifier } from '../NewsClassifier'
import type { RawNewsItem } from '../NewsQueue'
import { buildAliasIndex } from '../ticker-fallback'
import {
  CLASSIFIER_OUTPUT_VERSION,
  CONFIDENCE_THRESHOLD_BY_VERSION,
  MULTI_TEAM_CAP,
  isTeamSignalConfident,
  resolveConfidenceThreshold,
} from '../types'
import { makeEnabledRuntime } from './helpers/enabled-llm-runtime'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logger } = require('../../utils/logger') as {
  logger: { info: jest.Mock; warn: jest.Mock; error: jest.Mock }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRawItem = (title: string, description?: string): RawNewsItem => ({
  url: 'https://ge.globo.com/1',
  title,
  ...(description === undefined ? {} : { description }),
  source: 'Globo Esporte',
  publishedAt: new Date().toISOString(),
})

const llmResponse = (json: object) => ({
  content: [{ type: 'text', text: JSON.stringify(json) }],
})

/** Aliases usados nos títulos dos casos abaixo. */
const ALIAS_INDEX = buildAliasIndex([
  { ticker: 'URU3', searchText: 'flamengo, mengao' },
  { ticker: 'POR3', searchText: 'palmeiras, verdao' },
  { ticker: 'CRZ3', searchText: 'cruzeiro, raposa' },
  { ticker: 'TIM3', searchText: 'corinthians, timao' },
])

/** Linha estruturada emitida por logger.info cujo `event` bate. */
const metricEvent = (event: string): Record<string, unknown> | undefined => {
  const line = logger.info.mock.calls
    .map((call) => String(call[0]))
    .find((text) => text.includes(`"event":"${event}"`))
  if (!line) return undefined
  return JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>
}

describe('NewsClassifier — contrato multi-time', () => {
  let redis: Redis
  let classifier: NewsClassifier

  beforeEach(async () => {
    redis = new RedisMock() as unknown as Redis
    await (redis as unknown as { set: (k: string, v: number, m: string, t: number) => Promise<unknown> })
      .set('news:sonnet:tokens', 60, 'EX', 60)
    classifier = new NewsClassifier(redis, undefined, makeEnabledRuntime())
    ;(classifier as unknown as { tickerIndex: typeof ALIAS_INDEX }).tickerIndex = ALIAS_INDEX
    mockCreate.mockReset()
    jest.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // Shape e compatibilidade do rank 0
  // -------------------------------------------------------------------------

  test('[SHAPE] grupo de 2 times com sinais opostos preserva ticker/sentiment de topo do rank 0', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'POR3', sentiment: 0.8, confidence: 0.95 },
        { ticker: 'URU3', sentiment: -0.8, confidence: 0.92 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem('Palmeiras vence Flamengo por 3x1'))

    expect(result.teams).toEqual([
      { ticker: 'POR3', sentiment: 0.8, confidence: 0.95, rank: 0, origin: 'classifier' },
      { ticker: 'URU3', sentiment: -0.8, confidence: 0.92, rank: 1, origin: 'classifier' },
    ])
    // Compatibilidade: topo é a projeção do rank 0.
    expect(result.ticker).toBe('POR3')
    expect(result.sentiment).toBe(0.8)
    expect(result.relevance).toBe(0.9)
  })

  test('[SHAPE] notícia sem clube afetado devolve teams vazio e topo neutro', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [], impactCategory: 'INSTITUCIONAL', relevance: 0.1,
    }))

    const result = await classifier.classify(makeRawItem('CBF anuncia mudança no calendário'))

    expect(result.teams).toEqual([])
    expect(result.ticker).toBe('')
    expect(result.sentiment).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Atribuição do rank 0 (âncora)
  // -------------------------------------------------------------------------

  test('[RANK 0] âncora é o primeiro ticker citado no título, não o primeiro da resposta', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'URU3', sentiment: -0.7, confidence: 0.99 },
        { ticker: 'POR3', sentiment: 0.7, confidence: 0.6 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.8,
    }))

    // O título cita Palmeiras (POR3) primeiro; o LLM listou Flamengo primeiro.
    const result = await classifier.classify(makeRawItem('Palmeiras atropela o Flamengo no Allianz'))

    expect(result.teams[0].ticker).toBe('POR3')
    expect(result.teams[0].rank).toBe(0)
    expect(result.ticker).toBe('POR3')
    expect(result.teams[1].ticker).toBe('URU3')
  })

  test('[RANK 0] título que não resolve nenhum ticker cai no primeiro do corpo, não na ordem do LLM', async () => {
    // O LLM lista CRZ3 primeiro; o CORPO cita o Corinthians (TIM3) antes do
    // Cruzeiro. A ordem da resposta é deliberadamente o inverso da ordem do
    // corpo: um parser que caísse em `candidates[0]` devolveria CRZ3 e passaria
    // no teste antigo, que não fornecia `description` nenhuma.
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'CRZ3', sentiment: -0.5, confidence: 0.8 },
        { ticker: 'TIM3', sentiment: -0.5, confidence: 0.8 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.7,
    }))

    const result = await classifier.classify(makeRawItem(
      'Empate elimina os dois na noite de ontem',
      'O Corinthians não passou do 0 a 0 e o Cruzeiro também ficou pelo caminho.',
    ))

    expect(result.teams[0].ticker).toBe('TIM3')
    expect(result.ticker).toBe('TIM3')
    expect(result.teams.map((team) => team.rank)).toEqual([0, 1])
  })

  test('[RANK 0] título vazio resolve a âncora pelo corpo', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'URU3', sentiment: 0.4, confidence: 0.9 },
        { ticker: 'POR3', sentiment: -0.4, confidence: 0.9 },
      ],
      impactCategory: 'ESPORTIVA_MENOR',
      relevance: 0.5,
    }))

    const result = await classifier.classify(makeRawItem(
      '',
      'O Palmeiras perdeu pontos e o Flamengo assumiu a liderança.',
    ))

    expect(result.teams[0].ticker).toBe('POR3')
    expect(result.teams[1].ticker).toBe('URU3')
  })

  test('[RANK 0] título e corpo irresolúveis caem na ordem da resposta como último recurso', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'CRZ3', sentiment: -0.5, confidence: 0.8 },
        { ticker: 'TIM3', sentiment: -0.5, confidence: 0.8 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.7,
    }))

    const result = await classifier.classify(makeRawItem(
      'Empate elimina os dois na noite de ontem',
      'Nenhum dos finalistas conseguiu abrir o placar no tempo normal.',
    ))

    expect(result.teams[0].ticker).toBe('CRZ3')
    expect(result.teams.map((team) => team.rank)).toEqual([0, 1])
  })

  test('[RANK 0] tickerIndex degradado (vazio) não quebra: âncora vira o primeiro candidato', async () => {
    ;(classifier as unknown as { tickerIndex: typeof ALIAS_INDEX }).tickerIndex = []
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'URU3', sentiment: 0.4, confidence: 0.9 },
        { ticker: 'POR3', sentiment: -0.4, confidence: 0.9 },
      ],
      impactCategory: 'ESPORTIVA_MENOR',
      relevance: 0.5,
    }))

    const result = await classifier.classify(makeRawItem(
      'Palmeiras perde para o Flamengo',
      'O Palmeiras foi superado no Allianz.',
    ))

    expect(result.teams[0].ticker).toBe('URU3')
    expect(result.teams[0].rank).toBe(0)
  })

  test('[RANK 0] confidence baixa na âncora NÃO neutraliza o sinal (limiar vale para ranks 1 e 2)', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'POR3', sentiment: 0.9, confidence: 0.2 },
        { ticker: 'URU3', sentiment: -0.9, confidence: 0.2 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem('Palmeiras vence Flamengo por 3x1'))

    expect(result.teams[0]).toMatchObject({ ticker: 'POR3', sentiment: 0.9, origin: 'classifier' })
    expect(result.sentiment).toBe(0.9)
    // O rank 1, com a mesma confidence, cai na política.
    expect(result.teams[1]).toMatchObject({ ticker: 'URU3', sentiment: 0, origin: 'low_confidence' })
  })

  // -------------------------------------------------------------------------
  // Passo 1 — dedup por ticker
  // -------------------------------------------------------------------------

  test('[DEDUP] ticker repetido mantém a primeira ocorrência e registra log estruturado', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'POR3', sentiment: 0.8, confidence: 0.9 },
        { ticker: 'POR3', sentiment: -0.4, confidence: 0.95 },
        { ticker: 'URU3', sentiment: -0.8, confidence: 0.9 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem('Palmeiras vence Flamengo por 3x1'))

    expect(result.teams.map((team) => team.ticker)).toEqual(['POR3', 'URU3'])
    expect(result.teams[0].sentiment).toBe(0.8)
    expect(metricEvent('news_classifier_teams_deduped')).toMatchObject({ duplicates: ['POR3'] })
  })

  test('[DEDUP] ticker fora da lista de 40 é descartado com aviso', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'POR3', sentiment: 0.8, confidence: 0.9 },
        { ticker: 'XXX9', sentiment: -0.8, confidence: 0.9 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem('Palmeiras vence por 3x1'))

    expect(result.teams.map((team) => team.ticker)).toEqual(['POR3'])
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Ticker inválido'))
  })

  // -------------------------------------------------------------------------
  // Passo 2 — política de confidence
  // -------------------------------------------------------------------------

  test('[CONFIDENCE] abaixo do limiar entra NEUTRAL com origem low_confidence, sem ser descartado', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'POR3', sentiment: 0.8, confidence: 0.9 },
        { ticker: 'URU3', sentiment: -0.8, confidence: 0.59 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem('Palmeiras vence Flamengo por 3x1'))

    expect(result.teams).toHaveLength(2)
    expect(result.teams[1]).toEqual({
      ticker: 'URU3', sentiment: 0, confidence: 0.59, rank: 1, origin: 'low_confidence',
    })
  })

  test('[CONFIDENCE] fronteira é >=: exatamente 0.6 é sinal confiado', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'POR3', sentiment: 0.8, confidence: 0.9 },
        { ticker: 'URU3', sentiment: -0.8, confidence: 0.6 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem('Palmeiras vence Flamengo por 3x1'))

    expect(result.teams[1]).toMatchObject({ sentiment: -0.8, origin: 'classifier' })
  })

  test('[CONFIDENCE] mapa versão -> limiar é fail-closed em versão desconhecida', () => {
    expect(resolveConfidenceThreshold(CLASSIFIER_OUTPUT_VERSION)).toBe(0.6)
    expect(resolveConfidenceThreshold('news-classifier/versao-inexistente')).toBeNull()
    expect(isTeamSignalConfident(1, 'news-classifier/versao-inexistente')).toBe(false)
    expect(isTeamSignalConfident(0.6)).toBe(true)
    expect(isTeamSignalConfident(0.5999)).toBe(false)
    expect(isTeamSignalConfident(Number.NaN)).toBe(false)
  })

  test('[CONFIDENCE] versão ativa tem entrada literal no mapa', () => {
    // As chaves do mapa são literais de propósito. Se fossem computadas a partir
    // de CLASSIFIER_OUTPUT_VERSION, bumpar a versão renomearia a entrada junto e
    // a nova versão herdaria o limiar antigo em silêncio — o fail-open que o
    // fail-closed existe para impedir se tornaria inalcançável.
    const keys = Object.keys(CONFIDENCE_THRESHOLD_BY_VERSION)
    expect(keys).toContain(CLASSIFIER_OUTPUT_VERSION)
    // Prova de que a chave é literal e não derivada: existe na fonte como string
    // fixa, e uma versão vizinha não calibrada não resolve limiar.
    expect(resolveConfidenceThreshold(`${CLASSIFIER_OUTPUT_VERSION}-rc2`)).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Passo 3 — corte para o cap
  // -------------------------------------------------------------------------

  test('[CAP] com 4 times a âncora tem vaga por direito e as outras 2 vão para os maiores confidence', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'CRZ3', sentiment: 0.6, confidence: 0.4 },
        { ticker: 'URU3', sentiment: -0.3, confidence: 0.95 },
        { ticker: 'POR3', sentiment: -0.2, confidence: 0.7 },
        { ticker: 'TIM3', sentiment: -0.4, confidence: 0.9 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.8,
    }))

    const result = await classifier.classify(
      makeRawItem('Cruzeiro vence e complica Flamengo, Palmeiras e Corinthians'),
    )

    expect(result.teams).toHaveLength(MULTI_TEAM_CAP)
    // Âncora (menor confidence do grupo) sobrevive ao corte por ser rank 0.
    expect(result.teams[0]).toMatchObject({ ticker: 'CRZ3', rank: 0 })
    // Ranks 1 e 2 em ordem de aparição, não em ordem de confidence.
    expect(result.teams.map((team) => team.ticker)).toEqual(['CRZ3', 'URU3', 'TIM3'])
    expect(metricEvent('news_classifier_teams_capped')).toMatchObject({
      cap: MULTI_TEAM_CAP,
      dropped: [{ ticker: 'POR3', confidence: 0.7 }],
    })
  })

  test('[CAP] empate de confidence desempata pela ordem de aparição', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'CRZ3', sentiment: 0.6, confidence: 0.9 },
        { ticker: 'URU3', sentiment: -0.3, confidence: 0.7 },
        { ticker: 'POR3', sentiment: -0.2, confidence: 0.7 },
        { ticker: 'TIM3', sentiment: -0.4, confidence: 0.7 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.8,
    }))

    const result = await classifier.classify(
      makeRawItem('Cruzeiro vence e complica Flamengo, Palmeiras e Corinthians'),
    )

    expect(result.teams.map((team) => team.ticker)).toEqual(['CRZ3', 'URU3', 'POR3'])
  })

  test('[ORDEM 2 antes de 3] time low_confidence ocupa vaga em vez de deixá-la vazia', async () => {
    // Só 2 candidatos além da âncora, um deles abaixo do limiar: ele NÃO é
    // descartado, então o grupo fecha em 3 com o low_confidence dentro.
    mockCreate.mockResolvedValue(llmResponse({
      teams: [
        { ticker: 'CRZ3', sentiment: 0.6, confidence: 0.9 },
        { ticker: 'URU3', sentiment: -0.3, confidence: 0.2 },
        { ticker: 'POR3', sentiment: -0.2, confidence: 0.8 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.8,
    }))

    const result = await classifier.classify(
      makeRawItem('Cruzeiro vence e complica Flamengo e Palmeiras'),
    )

    expect(result.teams).toHaveLength(3)
    expect(result.teams[1]).toMatchObject({ ticker: 'URU3', sentiment: 0, origin: 'low_confidence' })
    expect(result.teams[2]).toMatchObject({ ticker: 'POR3', sentiment: -0.2, origin: 'classifier' })
    expect(metricEvent('news_classifier_teams_capped')).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Fallback determinístico — sempre mono-time e sempre explicado
  // -------------------------------------------------------------------------

  test('[FALLBACK] JSON inválido cai em mono-time com origem classifier_fallback e motivo registrado', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'não é json' }] })

    const result = await classifier.classify(makeRawItem('Palmeiras goleia e dispara na liderança'))

    expect(result.teams).toEqual([
      { ticker: 'POR3', sentiment: 0, confidence: 0, rank: 0, origin: 'classifier_fallback' },
    ])
    expect(result.ticker).toBe('POR3')
    // Fallback não infla relevance: sem impacto de preço.
    expect(result.relevance).toBe(0)
    expect(metricEvent('news_classifier_deterministic_fallback')).toMatchObject({
      reason: 'parse_invalid', resolved: true, ticker: 'POR3', multi_team: false,
    })
  })

  test('[FALLBACK] LLM sem time e título irresolúvel registra o motivo e devolve teams vazio', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [], impactCategory: 'INSTITUCIONAL', relevance: 0.2,
    }))

    const result = await classifier.classify(makeRawItem('Conselho técnico define regulamento'))

    expect(result.teams).toEqual([])
    expect(metricEvent('news_classifier_deterministic_fallback')).toMatchObject({
      reason: 'llm_no_team', resolved: false, ticker: null,
    })
  })

  test('[FALLBACK] erro não-retentável da API cai em mono-time com motivo api_error_non_retryable', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('http 401'), { status: 401 }))

    const result = await classifier.classify(makeRawItem('Palmeiras goleia e dispara na liderança'))

    expect(result.teams).toEqual([
      { ticker: 'POR3', sentiment: 0, confidence: 0, rank: 0, origin: 'classifier_fallback' },
    ])
    expect(metricEvent('news_classifier_deterministic_fallback')).toMatchObject({
      reason: 'api_error_non_retryable', multi_team: false,
    })
  })

  // -------------------------------------------------------------------------
  // Retrocompatibilidade de entrada e prompt
  // -------------------------------------------------------------------------

  test('[LEGADO] resposta com ticker na raiz (sem teams[]) vira grupo unitário', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      ticker: 'URU3', sentiment: 0.8, impactCategory: 'ESPORTIVA_MAJORITARIA', relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem('Flamengo vence clássico'))

    expect(result.teams).toEqual([
      { ticker: 'URU3', sentiment: 0.8, confidence: 0, rank: 0, origin: 'classifier' },
    ])
    expect(result.ticker).toBe('URU3')
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('shape legado'))
  })

  test('[LEGADO] resposta híbrida (teams[] só com lixo + ticker raiz válido) não perde a notícia', async () => {
    // `teams` tem tamanho > 0 mas nenhum candidato sobrevive à normalização
    // (null, objeto sem ticker, ticker fora da lista de 40). Decidir pelo shape
    // legado olhando `rawTeams.length` ANTES de normalizar suprimiria o ticker
    // raiz válido e devolveria grupo vazio.
    mockCreate.mockResolvedValue(llmResponse({
      teams: [null, { sentiment: 0.5 }, { ticker: 'XXX9', sentiment: 0.5, confidence: 0.9 }],
      ticker: 'URU3',
      sentiment: 0.8,
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }))

    const result = await classifier.classify(makeRawItem('Flamengo vence clássico'))

    expect(result.teams).toEqual([
      { ticker: 'URU3', sentiment: 0.8, confidence: 0, rank: 0, origin: 'classifier' },
    ])
    expect(result.ticker).toBe('URU3')
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Resposta híbrida'))
  })

  test('[PROMPT] prefixo estático carrega as regras duras da seção 13.3 e o formato teams[]', async () => {
    mockCreate.mockResolvedValue(llmResponse({
      teams: [{ ticker: 'URU3', sentiment: 0.8, confidence: 0.9 }],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }))

    await classifier.classify(makeRawItem('Flamengo vence clássico'))

    const params = mockCreate.mock.calls[0][0] as {
      messages: Array<{ content: Array<{ text: string }> }>
    }
    const prefix = params.messages[0].content[0].text

    expect(prefix).toContain('"teams"')
    expect(prefix).toContain('confidence')
    expect(prefix).toContain('Vitória e derrota no mesmo confronto')
    expect(prefix).toContain('Venda de jogador para rival')
    expect(prefix).toContain('Empate que elimina os dois')
    expect(prefix).toContain('Lesão de jogador emprestado')
    expect(prefix).toContain('Decisão judicial ou administrativa')
    expect(prefix).toContain('Menção incidental')
    expect(prefix).toContain('Ambiguidade')
  })

  test('[PROMPT] o corte para o cap NÃO é delegado ao LLM', async () => {
    // O corte para MULTI_TEAM_CAP é o passo 3 do pipeline local, depois do dedup
    // e da política de confidence. Se o prompt pedisse "no máximo 3", o modelo
    // pré-selecionaria com critério desconhecido: um 4º clube com confidence
    // maior que um dos 3 devolvidos nunca chegaria ao código e não entraria em
    // `news_classifier_teams_capped`.
    mockCreate.mockResolvedValue(llmResponse({
      teams: [{ ticker: 'URU3', sentiment: 0.8, confidence: 0.9 }],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }))

    await classifier.classify(makeRawItem('Flamengo vence clássico'))

    const params = mockCreate.mock.calls[0][0] as {
      messages: Array<{ content: Array<{ text: string }> }>
      max_tokens: number
    }
    const prefix = params.messages[0].content[0].text

    expect(prefix).toContain('sem limite de quantidade')
    expect(prefix).not.toContain(`no máximo ${MULTI_TEAM_CAP}`)
    expect(prefix).not.toMatch(/no máximo \d+ (clube|time)/i)
    // Orçamento de saída compatível com uma lista sem teto declarado.
    expect(params.max_tokens).toBeGreaterThanOrEqual(512)
  })

  // -------------------------------------------------------------------------
  // fallbackReason — insumo do gate editorial (`editorial-gate.ts`)
  //
  // A distinção que importa: "o modelo DISSE que não há clube" (veredito, bloqueia)
  // versus "não deu para saber" (degradação, cai no resolvedor determinístico).
  // Carimbar o motivo errado inverte a decisão do gate.
  // -------------------------------------------------------------------------

  describe('[FALLBACK REASON]', () => {
    test('lista de times VAZIA e explícita vira veredito llm_no_team', async () => {
      mockCreate.mockResolvedValue(llmResponse({
        teams: [], impactCategory: 'INSTITUCIONAL', relevance: 0.1,
      }))

      const result = await classifier.classify(
        makeRawItem('LeBron James negocia com os 76ers')
      )

      expect(result.fallbackReason).toBe('llm_no_team')
      expect(result.llmDegraded).toBe(false)
    })

    test('payload de time INUTILIZÁVEL não vira veredito — é parse_invalid', async () => {
      // Ticker fora dos 40 do app: `parseTeams` normaliza para zero candidatos.
      // Sem esta distinção o gate leria "o LLM disse que não há clube" e bloquearia
      // uma notícia que na verdade nunca foi classificada.
      mockCreate.mockResolvedValue(llmResponse({
        teams: [{ ticker: 'XYZ9', sentiment: 0.5, confidence: 0.9 }],
        impactCategory: 'ESPORTIVA_MAJORITARIA',
        relevance: 0.8,
      }))

      const result = await classifier.classify(
        makeRawItem('Notícia sobre um clube que o app não lista')
      )

      expect(result.teams).toEqual([])
      expect(result.fallbackReason).toBe('parse_invalid')
      expect(result.llmDegraded).toBe(true)
    })

    test('resposta que não é JSON vira parse_invalid', async () => {
      mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'desculpe, não consigo' }] })

      const result = await classifier.classify(makeRawItem('Manchete qualquer'))

      expect(result.fallbackReason).toBe('parse_invalid')
      expect(result.llmDegraded).toBe(true)
    })

    test('classificação bem-sucedida NÃO carimba motivo nenhum', async () => {
      mockCreate.mockResolvedValue(llmResponse({
        teams: [{ ticker: 'URU3', sentiment: 0.8, confidence: 0.9 }],
        impactCategory: 'ESPORTIVA_MAJORITARIA',
        relevance: 0.9,
      }))

      const result = await classifier.classify(makeRawItem('Flamengo vence clássico'))

      expect(result.fallbackReason).toBeUndefined()
      expect(result.llmDegraded).toBeUndefined()
    })

    test('resolvedor por título salva o ticker mas o motivo continua carimbado', async () => {
      // O gate precisa saber que a âncora veio de heurística, não de análise:
      // é o que faz a publicação sair como DEGRADADA (sem despachar preço).
      mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'nao é json' }] })

      const result = await classifier.classify(makeRawItem('Flamengo anuncia reforço'))

      expect(result.ticker).toBe('URU3')
      expect(result.fallbackReason).toBe('parse_invalid')
      expect(result.llmDegraded).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Resposta fora do contrato de formato — regressão do incidente 2026-07-30
  //
  // O prompt pede "Responda SOMENTE com JSON", mas depois que o formato virou
  // aninhado (`{"teams":[...]}`) o Sonnet passou a embrulhar tudo em code fence
  // markdown (~83% das chamadas) ou a escrever preâmbulo em prosa (~17%). O
  // `JSON.parse` no texto cru derrubava 100% das notícias em `parse_invalid` ->
  // gate editorial degradado -> nada de despacho de preço, por 11 dias.
  //
  // Os mocks do resto da suíte usam `JSON.stringify` puro, que é exatamente o
  // caso que produção NÃO estava produzindo — por isso a suíte ficou verde o
  // incidente inteiro. Os payloads daqui são cópias literais do que voltou.
  // -------------------------------------------------------------------------

  describe('[FORMATO FORA DE CONTRATO]', () => {
    const CLASSIFICACAO = {
      teams: [
        { ticker: 'URU3', sentiment: 0.8, confidence: 0.95 },
        { ticker: 'POR3', sentiment: -0.8, confidence: 0.9 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    }
    const JSON_TEXT = JSON.stringify(CLASSIFICACAO)
    const TITULO = 'Flamengo vence Palmeiras por 3x1 e assume a liderança'

    /** Resposta com blocos `text` arbitrários (o SDK pode devolver mais de um). */
    const respostaComBlocos = (...textos: string[]) => ({
      content: textos.map((text) => ({ type: 'text', text })),
    })

    const esperaClassificado = (result: Awaited<ReturnType<NewsClassifier['classify']>>) => {
      expect(result.teams.map((team) => team.ticker)).toEqual(['URU3', 'POR3'])
      expect(result.ticker).toBe('URU3')
      expect(result.sentiment).toBe(0.8)
      expect(result.relevance).toBe(0.9)
      // Sem carimbo de degradação: a classificação é do LLM, não de heurística.
      expect(result.fallbackReason).toBeUndefined()
      expect(result.llmDegraded).toBeUndefined()
    }

    test('```json — resposta real de produção 2026-08-10 classifica normalmente', async () => {
      mockCreate.mockResolvedValue(respostaComBlocos('```json\n' + JSON_TEXT + '\n```'))

      esperaClassificado(await classifier.classify(makeRawItem(TITULO)))
      expect(metricEvent('news_classifier_anthropic_call')).toMatchObject({
        parse_valid: true,
        payload_strategy: 'fenced',
      })
    })

    test('preâmbulo em prosa antes do JSON classifica normalmente', async () => {
      mockCreate.mockResolvedValue(respostaComBlocos(
        'I need to analyze this match result between the two clubs.\n\n' + JSON_TEXT
      ))

      esperaClassificado(await classifier.classify(makeRawItem(TITULO)))
      expect(metricEvent('news_classifier_anthropic_call')).toMatchObject({
        payload_strategy: 'embedded',
      })
    })

    test('preâmbulo num bloco text e JSON no seguinte classifica normalmente', async () => {
      // Modelo com thinking (ou que resolve narrar antes) parte a resposta em
      // dois blocos. Ler só `content[0]` descartava a resposta inteira.
      mockCreate.mockResolvedValue(respostaComBlocos(
        'Analisando: clássico com vencedor definido, dois clubes da lista.',
        '```json\n' + JSON_TEXT + '\n```',
      ))

      esperaClassificado(await classifier.classify(makeRawItem(TITULO)))
    })

    test('JSON puro continua sendo o caminho feliz (não-regressão)', async () => {
      mockCreate.mockResolvedValue(llmResponse(CLASSIFICACAO))

      esperaClassificado(await classifier.classify(makeRawItem(TITULO)))
      expect(metricEvent('news_classifier_anthropic_call')).toMatchObject({
        payload_strategy: 'raw',
      })
    })

    test('resgate não engole lixo: sem JSON continua parse_invalid', async () => {
      mockCreate.mockResolvedValue(respostaComBlocos(
        'Desculpe, não consigo classificar esta notícia com as regras fornecidas.'
      ))

      const result = await classifier.classify(makeRawItem(TITULO))

      expect(result.fallbackReason).toBe('parse_invalid')
      expect(result.llmDegraded).toBe(true)
      expect(metricEvent('news_classifier_anthropic_call')).toMatchObject({
        parse_valid: false,
        payload_strategy: 'none',
      })
    })

    test('duas classificações conflitantes degradam em vez de chutar uma', async () => {
      // Rascunho seguido de versão final: escolher por posição arriscaria
      // publicar o rascunho como veredito. Degradar é o comportamento correto.
      const rascunho = JSON.stringify({
        teams: [{ ticker: 'URU3', sentiment: -0.2, confidence: 0.4 }],
        impactCategory: 'ESPORTIVA_MENOR',
        relevance: 0.2,
      })
      mockCreate.mockResolvedValue(respostaComBlocos(
        'Primeira leitura:\n' + rascunho + '\n\nCorrigindo:\n' + JSON_TEXT
      ))

      const result = await classifier.classify(makeRawItem(TITULO))

      expect(result.fallbackReason).toBe('parse_invalid')
      expect(result.llmDegraded).toBe(true)
    })
  })
})
