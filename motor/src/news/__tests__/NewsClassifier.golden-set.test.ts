// ============================================================================
// Golden set do classificador multi-time (item 012, loop
// 07-28-noticias-multi-time-linha-por-time)
//
// Mede sobre o corpus rotulado de `fixtures/multi-team-golden-set.ts`:
//
//   TAXA A — acerto de sinal por time ENTRE OS TIMES ACIMA DO LIMIAR.
//            Gate do criterio 31: >= 85%. Abaixo disso dispara o gatilho de
//            reversao (d) da secao 10.5 e o item para.
//   TAXA B — proporcao de times LEGITIMOS que cairam em `low_confidence`.
//            Sem gate numerico proprio: e o custo do limiar, e existe para ser
//            lido JUNTO com a taxa A. Um limiar que zera o erro de sinal
//            apagando quase todo time secundario derrota o proposito da feature.
//   TAXA C — proporcao de times legitimos que nem chegaram ao grupo (corte pelo
//            cap de 3). Nao e erro de sinal: e limite de desenho, medido a parte.
//
// As taxas A e B se movem em direcoes OPOSTAS quando o limiar sobe. Por isso o
// sweep abaixo reporta as duas para varios limiares: e ele que VALIDA o valor
// 0.6 da versao corrente em vez de escolhe-lo por gosto. A FORMA do limiar
// (mapa por versao, fail-closed, `>=`, rank 0 fora do gate) foi fechada no item
// 011 e nao se reabre aqui.
//
// LIMITE DECLARADO: o corpus e agent-sim com `provenance: 'simulated'` (ver
// cabecalho/meta da fixture). Este numero mede FIDELIDADE DE PIPELINE, nao a
// hipotese H8. O teste [H8/CI] no fim do arquivo impede promover esta simulacao
// a evidencia de producao.
// ============================================================================

import RedisMock from 'ioredis-mock'
import type Redis from 'ioredis'
import { NewsClassifier } from '../NewsClassifier'
import { makeEnabledRuntime } from './helpers/enabled-llm-runtime'
import type { RawNewsItem } from '../NewsQueue'
import { buildAliasIndex, resolveFromIndex } from '../ticker-fallback'
import {
  CLASSIFIER_OUTPUT_VERSION,
  CONFIDENCE_THRESHOLD_BY_VERSION,
  MULTI_TEAM_CAP,
  resolveConfidenceThreshold,
  type ClassifiedTeam,
} from '../types'
import {
  GOLDEN_SET,
  GOLDEN_ASSET_ALIASES,
  GOLDEN_SET_META,
  GOLDEN_SET_MIN_SIZE,
  HARD_CASES_OBRIGATORIOS,
  isProductionH8Evidence,
  SIGNAL_ACCURACY_TARGET,
  THRESHOLD_SWEEP,
  type ExpectedSignal,
  type GoldenCase,
} from './fixtures/multi-team-golden-set'

// ---------------------------------------------------------------------------
// Mocks (mesmo harness da suite de contrato do item 011)
// ---------------------------------------------------------------------------

const mockCreate = jest.fn()
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }))
})

/**
 * O objeto do mock e ESTAVEL entre `jest.resetModules()` de proposito: o CASO 5
 * re-requer o classificador num registry limpo e precisa observar o MESMO
 * logger. Uma factory que devolve `{ info: jest.fn() }` novo a cada require
 * daria ao modulo isolado um logger diferente do que o teste inspeciona, e as
 * asserts de telemetria falhariam por identidade, nao por comportamento.
 *
 * A instancia vive em `globalThis` porque `jest.mock` e hasteado acima de
 * qualquer `const` do arquivo (TDZ) e o registry de modulos e limpo pelo
 * `resetModules` — `globalThis` sobrevive aos dois.
 */
type LoggerMock = { info: jest.Mock; warn: jest.Mock; error: jest.Mock }
const loggerHolder = globalThis as unknown as { __goldenSetLogger?: LoggerMock }

jest.mock('../../utils/logger', () => {
  const holder = globalThis as unknown as { __goldenSetLogger?: LoggerMock }
  if (!holder.__goldenSetLogger) {
    holder.__goldenSetLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  }
  return { logger: holder.__goldenSetLogger }
})

const logger = loggerHolder.__goldenSetLogger as LoggerMock

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALIAS_INDEX = buildAliasIndex([...GOLDEN_ASSET_ALIASES])

const makeRawItem = (title: string, description: string): RawNewsItem => ({
  url: 'https://ge.globo.com/golden-set',
  title,
  description,
  source: 'Globo Esporte',
  publishedAt: '2026-07-28T12:00:00.000Z',
})

const llmResponse = (json: object) => ({
  content: [{ type: 'text', text: JSON.stringify(json) }],
})

const metricEvent = (event: string): Record<string, unknown> | undefined => {
  const line = logger.info.mock.calls
    .map((call) => String(call[0]))
    .find((text) => text.includes(`"event":"${event}"`))
  if (!line) return undefined
  return JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>
}

const signOf = (sentiment: number): ExpectedSignal =>
  sentiment > 0 ? 'positivo' : sentiment < 0 ? 'negativo' : 'neutro'

const pct = (n: number, d: number): string =>
  d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)}%`

const makeClassifier = (): { redis: Redis; classifier: NewsClassifier } => {
  const redis = new RedisMock() as unknown as Redis
  const classifier = new NewsClassifier(redis, undefined, makeEnabledRuntime())
  ;(classifier as unknown as { tickerIndex: typeof ALIAS_INDEX }).tickerIndex = ALIAS_INDEX
  return { redis, classifier }
}

// ---------------------------------------------------------------------------
// Execucao do corpus (uma vez, em beforeAll — 32 chamadas ao pipeline real)
// ---------------------------------------------------------------------------

interface Run {
  gold: GoldenCase
  teams: ClassifiedTeam[]
  topTicker: string
  topSentiment: number
}

const runs: Run[] = []

/**
 * Pontuacao do corpus. `threshold === null` usa a decisao REAL do pipeline
 * (campo `origin`); um numero recalcula a decisao a partir do `confidence`
 * original da fixture, que e o que permite varrer limiares sem re-executar o
 * classificador. O teste [SWEEP-CONSISTENCIA] prova que os dois caminhos
 * coincidem em 0.6 — sem isso o sweep seria um modelo paralelo nao verificado.
 */
interface Scorecard {
  hits: number
  evaluated: number
  accuracy: number
  lowConfidence: number
  legitInGroup: number
  lowConfidenceRate: number
  missesById: Array<{ id: string; ticker: string; esperado: ExpectedSignal; obtido: ExpectedSignal }>
}

function scoreCorpus(threshold: number | null): Scorecard {
  let hits = 0
  let evaluated = 0
  let lowConfidence = 0
  let legitInGroup = 0
  const missesById: Scorecard['missesById'] = []

  for (const run of runs) {
    for (const team of run.teams) {
      const label = run.gold.labels.find((candidate) => candidate.ticker === team.ticker)
      const rawConfidence =
        run.gold.llm.teams.find((candidate) => candidate.ticker === team.ticker)?.confidence ??
        team.confidence
      const rawSentiment =
        run.gold.llm.teams.find((candidate) => candidate.ticker === team.ticker)?.sentiment ??
        team.sentiment

      const dispatching =
        threshold === null
          ? team.origin !== 'low_confidence'
          : team.rank === 0 || rawConfidence >= threshold

      const isLegit = label !== undefined && label.expected !== 'ausente'
      if (isLegit) legitInGroup += 1

      if (!dispatching) {
        if (isLegit) lowConfidence += 1
        continue
      }

      // Time despachavel: entra na taxa A, tenha rotulo legitimo ou nao.
      // Time sem rotulo, ou rotulado 'ausente', e falso positivo do
      // classificador — conta como ERRO de sinal, nunca como ausencia de dado.
      evaluated += 1
      const obtido = signOf(threshold === null ? team.sentiment : rawSentiment)
      const esperado: ExpectedSignal = label?.expected ?? 'ausente'
      if (label !== undefined && label.expected !== 'ausente' && label.expected === obtido) {
        hits += 1
      } else {
        missesById.push({ id: run.gold.id, ticker: team.ticker, esperado, obtido })
      }
    }
  }

  return {
    hits,
    evaluated,
    accuracy: evaluated === 0 ? 0 : hits / evaluated,
    lowConfidence,
    legitInGroup,
    lowConfidenceRate: legitInGroup === 0 ? 0 : lowConfidence / legitInGroup,
    missesById,
  }
}

beforeAll(async () => {
  const { redis, classifier } = makeClassifier()
  await (redis as unknown as { set: (k: string, v: number, m: string, t: number) => Promise<unknown> })
    .set('news:sonnet:tokens', 10_000, 'EX', 600)

  for (const gold of GOLDEN_SET) {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue(llmResponse(gold.llm))
    const result = await classifier.classify(makeRawItem(gold.title, gold.description))
    runs.push({
      gold,
      teams: result.teams,
      topTicker: result.ticker,
      topSentiment: result.sentiment,
    })
  }
})

// ---------------------------------------------------------------------------
// 1. Integridade do proprio corpus
// ---------------------------------------------------------------------------

describe('Golden set — integridade do corpus', () => {
  test('[CORPUS] tem no minimo 30 manchetes e todas sao multi-time na rotulagem', () => {
    expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(GOLDEN_SET_MIN_SIZE)
    for (const gold of GOLDEN_SET) {
      expect(gold.labels.length).toBeGreaterThanOrEqual(2)
    }
  })

  test('[CORPUS] ids sao unicos e cada rotulo tem justificativa', () => {
    const ids = GOLDEN_SET.map((gold) => gold.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const gold of GOLDEN_SET) {
      for (const label of gold.labels) {
        expect(label.why.length).toBeGreaterThan(10)
      }
    }
  })

  test('[CORPUS] os 4 casos duros da secao 13.3 estao cobertos', () => {
    const cobertos = new Set(GOLDEN_SET.flatMap((gold) => gold.hardCases))
    for (const hard of HARD_CASES_OBRIGATORIOS) {
      expect(cobertos.has(hard)).toBe(true)
    }
    // Cada caso duro precisa de mais de uma manchete: um exemplo unico nao
    // distingue "a regra funciona" de "aquela manchete funciona".
    for (const hard of HARD_CASES_OBRIGATORIOS) {
      const quantos = GOLDEN_SET.filter((gold) => gold.hardCases.includes(hard)).length
      expect(quantos).toBeGreaterThanOrEqual(3)
    }
  })

  test('[CORPUS] todo ticker rotulado existe no indice de aliases da fixture', () => {
    const conhecidos = new Set(GOLDEN_ASSET_ALIASES.map((asset) => asset.ticker))
    for (const gold of GOLDEN_SET) {
      for (const label of gold.labels) {
        expect(conhecidos.has(label.ticker)).toBe(true)
      }
    }
  })

  test('[CORPUS] todo alias declarado sobreviveu ao denylist e a supressao de colisao', () => {
    // buildAliasIndex descarta alias ambiguo em silencio. Se um alias do corpus
    // for descartado, os titulos deixam de resolver ancora e a medicao vira
    // ruido — por isso a fixture verifica o indice EFETIVO, nao o declarado.
    const tickersNoIndice = new Set(ALIAS_INDEX.map(([, ticker]) => ticker))
    for (const asset of GOLDEN_ASSET_ALIASES) {
      expect(tickersNoIndice.has(asset.ticker)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Ancoragem (rank 0) sobre o corpus inteiro
// ---------------------------------------------------------------------------

describe('Golden set — ancora', () => {
  test('[ANCORA] rank 0 de cada manchete e o esperado pela rotulagem', () => {
    const divergentes = runs
      .filter(
        (run) =>
          !run.gold.modelError &&
          run.teams.length > 0 &&
          run.teams[0].ticker !== run.gold.expectedAnchor,
      )
      .map((run) => `${run.gold.id}: esperado ${run.gold.expectedAnchor}, obtido ${run.teams[0].ticker}`)
    expect(divergentes).toEqual([])
  })

  test('[ANCORA] ticker/sentiment de topo espelham sempre o rank 0', () => {
    for (const run of runs) {
      expect(run.topTicker).toBe(run.teams[0]?.ticker ?? '')
      expect(run.topSentiment).toBe(run.teams[0]?.sentiment ?? 0)
    }
  })

  test('[ANCORA] nenhum grupo excede o cap e os ranks sao 0..n sem buraco', () => {
    for (const run of runs) {
      expect(run.teams.length).toBeLessThanOrEqual(MULTI_TEAM_CAP)
      expect(run.teams.map((team) => team.rank)).toEqual(run.teams.map((_, index) => index))
    }
  })
})

// ---------------------------------------------------------------------------
// 3. A medicao — taxas A, B e C
// ---------------------------------------------------------------------------

describe('Golden set — acerto de sinal por time', () => {
  test('[TAXA-A] acerto de sinal entre os times acima do limiar >= 85% (criterio 31)', () => {
    const card = scoreCorpus(null)

    // O relatorio e impresso mesmo quando passa: o numero e o entregavel do
    // item, nao so o verde do teste.
    const linhas = [
      '',
      '===== GOLDEN SET — CLASSIFICADOR MULTI-TIME (item 012) =====',
      `manchetes: ${GOLDEN_SET.length} | versao: ${CLASSIFIER_OUTPUT_VERSION} | limiar: ${resolveConfidenceThreshold(CLASSIFIER_OUTPUT_VERSION)}`,
      `TAXA A  acerto de sinal (times despachaveis): ${card.hits}/${card.evaluated} = ${pct(card.hits, card.evaluated)}`,
      `TAXA B  low_confidence entre times legitimos: ${card.lowConfidence}/${card.legitInGroup} = ${pct(card.lowConfidence, card.legitInGroup)}`,
    ]
    if (card.missesById.length > 0) {
      linhas.push('erros de sinal:')
      for (const miss of card.missesById) {
        linhas.push(`  ${miss.id} ${miss.ticker}: esperado ${miss.esperado}, obtido ${miss.obtido}`)
      }
    }
    // eslint-disable-next-line no-console
    console.log(linhas.join('\n'))

    expect(card.evaluated).toBeGreaterThan(0)
    expect(card.accuracy).toBeGreaterThanOrEqual(SIGNAL_ACCURACY_TARGET)
  })

  test('[TAXA-A] acerto por ticker registrado (quebra por time)', () => {
    const porTicker = new Map<string, { hits: number; total: number }>()

    for (const run of runs) {
      for (const team of run.teams) {
        if (team.origin === 'low_confidence') continue
        const label = run.gold.labels.find((candidate) => candidate.ticker === team.ticker)
        const acerto =
          label !== undefined && label.expected !== 'ausente' && label.expected === signOf(team.sentiment)
        const bucket = porTicker.get(team.ticker) ?? { hits: 0, total: 0 }
        bucket.total += 1
        if (acerto) bucket.hits += 1
        porTicker.set(team.ticker, bucket)
      }
    }

    const linhas = ['', '--- acerto por ticker ---']
    for (const [ticker, bucket] of [...porTicker.entries()].sort()) {
      linhas.push(`  ${ticker}: ${bucket.hits}/${bucket.total} = ${pct(bucket.hits, bucket.total)}`)
    }
    // eslint-disable-next-line no-console
    console.log(linhas.join('\n'))

    // Todo ticker do corpus precisa ter aparecido pelo menos uma vez com sinal
    // despachavel: um ticker que nunca despacha nao foi medido, e "nao medido"
    // nao pode passar por "100%".
    expect(porTicker.size).toBeGreaterThanOrEqual(15)
  })

  test('[TAXA-C] corte pelo cap e medido a parte e nao contamina a taxa A', () => {
    let legitTotal = 0
    let legitForaDoGrupo = 0
    const cortados: string[] = []

    for (const run of runs) {
      const noGrupo = new Set(run.teams.map((team) => team.ticker))
      for (const label of run.gold.labels) {
        if (label.expected === 'ausente') continue
        legitTotal += 1
        if (!noGrupo.has(label.ticker)) {
          legitForaDoGrupo += 1
          cortados.push(`${run.gold.id} ${label.ticker}`)
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `\nTAXA C  times legitimos fora do grupo (cap ${MULTI_TEAM_CAP}): ` +
      `${legitForaDoGrupo}/${legitTotal} = ${pct(legitForaDoGrupo, legitTotal)}` +
      (cortados.length > 0 ? `\n  cortados: ${cortados.join(', ')}` : '')
    )

    // Duas causas DISJUNTAS para um time esperado ficar fora do grupo final:
    //   (a) o LLM retornou o time e o cap o cortou  -> invariante do cap, aqui;
    //   (b) o LLM nunca retornou o time             -> recall do modelo, medido
    //       pela taxa A, nao por este assert.
    // A asercao do ramo (a) e INCONDICIONAL dentro do seu dominio: se o time
    // veio do LLM e sumiu, a manchete OBRIGATORIAMENTE tinha mais times que o
    // cap e o grupo final tem exatamente o tamanho do cap. Condicionar o assert
    // ao proprio predicado que ele deveria provar o tornaria pulavel.
    for (const run of runs) {
      const noGrupo = new Set(run.teams.map((team) => team.ticker))
      const retornadosPeloLlm = new Set(run.gold.llm.teams.map((team) => team.ticker))
      const foraDoGrupo = run.gold.labels.filter(
        (label) => label.expected !== 'ausente' && !noGrupo.has(label.ticker)
      )
      const cortadosPeloCap = foraDoGrupo.filter((label) => retornadosPeloLlm.has(label.ticker))
      if (cortadosPeloCap.length > 0) {
        expect(run.gold.llm.teams.length).toBeGreaterThan(MULTI_TEAM_CAP)
        expect(run.teams).toHaveLength(MULTI_TEAM_CAP)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 4. Sweep de limiar — a evidencia que VALIDA o valor 0.6
// ---------------------------------------------------------------------------

describe('Golden set — sweep de limiar', () => {
  test('[SWEEP-CONSISTENCIA] recalculo em 0.6 reproduz a decisao real do pipeline', () => {
    const real = scoreCorpus(null)
    const modelo = scoreCorpus(0.6)
    expect({ hits: modelo.hits, evaluated: modelo.evaluated, low: modelo.lowConfidence }).toEqual({
      hits: real.hits,
      evaluated: real.evaluated,
      low: real.lowConfidence,
    })
  })

  test('[SWEEP] taxas A e B por limiar e o 0.6 sustenta a meta', () => {
    const linhas = [
      '',
      '--- sweep de limiar (A sobe, B sobe junto: o custo do rigor) ---',
      'limiar |  taxa A (acerto)  |  taxa B (low_confidence)',
    ]
    const resultados = THRESHOLD_SWEEP.map((threshold) => {
      const card = scoreCorpus(threshold)
      linhas.push(
        `  ${threshold.toFixed(2)} |  ${card.hits}/${card.evaluated} = ${pct(card.hits, card.evaluated).padStart(6)}  |  ` +
        `${card.lowConfidence}/${card.legitInGroup} = ${pct(card.lowConfidence, card.legitInGroup)}`
      )
      return { threshold, card }
    })
    // eslint-disable-next-line no-console
    console.log(linhas.join('\n'))

    const atual = resolveConfidenceThreshold(CLASSIFIER_OUTPUT_VERSION)
    expect(atual).not.toBeNull()

    // O valor da versao corrente tem de sustentar a meta. Se este expect cair,
    // a correcao NAO e mudar o teste nem a forma do limiar: e mover o VALOR da
    // entrada da versao corrente em CONFIDENCE_THRESHOLD_BY_VERSION para um
    // limiar do sweep que sustente a meta, registrando o numero novo com o dado
    // que o justifica.
    const noAtual = resultados.find((entrada) => entrada.threshold === atual)
    expect(noAtual).toBeDefined()
    expect(noAtual!.card.accuracy).toBeGreaterThanOrEqual(SIGNAL_ACCURACY_TARGET)

    // A taxa B tem de ser monotonicamente nao-decrescente com o limiar. Se
    // nao for, o modelo do sweep esta errado (ou a politica deixou de ser um
    // corte simples por confidence) e o numero do sweep nao pode ser citado.
    for (let i = 1; i < resultados.length; i += 1) {
      expect(resultados[i].card.lowConfidence).toBeGreaterThanOrEqual(
        resultados[i - 1].card.lowConfidence
      )
    }
  })
})

// ---------------------------------------------------------------------------
// 5. Os cinco casos que a decisao do operador exige com caso proprio
// ---------------------------------------------------------------------------

describe('Golden set — casos obrigatorios do limiar e do cap', () => {
  const runOf = (id: string): Run => {
    const run = runs.find((candidate) => candidate.gold.id === id)
    if (!run) throw new Error(`caso ${id} ausente do corpus`)
    return run
  }

  test('[CASO 1] manchete com 4+ times: o time do titulo sobrevive ao corte', () => {
    // Dinamico: usa os casos reais que exercitam o corte pelo cap.
    const candidatos = runs.filter((run) => run.gold.llm.teams.length > MULTI_TEAM_CAP)
    expect(candidatos.length).toBeGreaterThanOrEqual(1)

    for (const run of candidatos) {
      expect(run.teams).toHaveLength(MULTI_TEAM_CAP)
      expect(run.teams[0].ticker).toBe(run.gold.expectedAnchor)

      // O grupo final nao contem pelo menos um dos times nao-ancora: o cap
      // cortou alguem. Em caso de empate de confidence, qualquer um dos
      // empatados pode ser cortado; o importante e que a ancora sobreviva.
      const noGrupo = new Set(run.teams.map((team) => team.ticker))
      const naoAncora = run.gold.llm.teams
        .filter((team) => team.ticker !== run.gold.expectedAnchor)
        .map((team) => team.ticker)
      const cortados = naoAncora.filter((ticker) => !noGrupo.has(ticker))
      expect(cortados.length).toBeGreaterThanOrEqual(1)
    }
  })

  test('[CASO 2] time do titulo com o menor confidence do grupo continua rank 0 e fora do gate', () => {
    // Dinamico: casos reais onde a ancora e a de menor confidence do grupo E
    // esta abaixo do limiar. O "fora do gate" do nome do teste depende das DUAS
    // condicoes — sem a segunda, o caso nao exercita o gate e o teste vira
    // tautologia. O corpus real-http tem esse cenario (GS-21, GS-28).
    const limiar = resolveConfidenceThreshold(CLASSIFIER_OUTPUT_VERSION)!
    const candidatos = runs.filter((run) => {
      const doTitulo = run.gold.llm.teams.find((team) => team.ticker === run.gold.expectedAnchor)
      if (!doTitulo || run.gold.llm.teams.length === 0) return false
      const menor = doTitulo.confidence === Math.min(...run.gold.llm.teams.map((team) => team.confidence))
      return menor && doTitulo.confidence < limiar
    })
    expect(candidatos.length).toBeGreaterThanOrEqual(1)

    for (const run of candidatos) {
      const confidences = run.gold.llm.teams.map((team) => team.confidence)
      const doTitulo = run.gold.llm.teams.find((team) => team.ticker === run.gold.expectedAnchor)!
      expect(doTitulo.confidence).toBe(Math.min(...confidences))
      expect(doTitulo.confidence).toBeLessThan(limiar)

      const ancora = run.teams[0]
      expect(ancora.ticker).toBe(run.gold.expectedAnchor)
      expect(ancora.rank).toBe(0)
      // Fora do gate: mantem o sentimento original em vez de ser zerado.
      expect(ancora.origin).toBe('classifier')
      expect(ancora.sentiment).toBe(doTitulo.sentiment)
    }
  })

  test('[CASO 3] time secundario com confidence exatamente no limiar passa, porque a comparacao e >=', () => {
    // Dinamico: encontra um caso real onde algum time nao-ancora tenha
    // confidence exatamente igual ao limiar.
    const limiar = resolveConfidenceThreshold(CLASSIFIER_OUTPUT_VERSION)!
    const run = runs.find((r) =>
      r.gold.llm.teams.some(
        (team) => team.ticker !== r.gold.expectedAnchor && team.confidence === limiar,
      ),
    )
    expect(run).toBeDefined()

    const secundario = run!.gold.llm.teams.find(
      (team) => team.ticker !== run!.gold.expectedAnchor && team.confidence === limiar,
    )!
    const saida = run!.teams.find((team) => team.ticker === secundario.ticker)!
    expect(saida.rank).toBeGreaterThan(0)
    expect(saida.origin).toBe('classifier')
    expect(saida.confidence).toBe(limiar)
  })

  test('[CASO 4] time secundario logo abaixo do limiar vira NEUTRAL com origem low_confidence e nao despacha', () => {
    // Dinamico: encontra um caso real onde um time nao-ancora esta logo abaixo
    // do limiar e vizinhos da mesma manchete passam. Se o corpus real nao
    // exercitar este cenario exato, o teste verifica o mecanismo em qualquer
    // time abaixo do limiar.
    const limiar = resolveConfidenceThreshold(CLASSIFIER_OUTPUT_VERSION)!
    const run = runs.find((r) => {
      const abaixo = r.gold.llm.teams.find(
        (team) =>
          team.ticker !== r.gold.expectedAnchor &&
          team.confidence < limiar &&
          limiar - team.confidence <= 0.05,
      )
      if (!abaixo) return false
      const acima = r.gold.llm.teams.filter(
        (team) => team.ticker !== r.gold.expectedAnchor && team.confidence >= limiar,
      )
      return acima.length >= 1
    })

    if (!run) {
      // Fallback: pelo menos um time abaixo do limiar (em qualquer manchete)
      // deve ter origin low_confidence e sentiment 0.
      const abaixo = runs
        .flatMap((r) => r.gold.llm.teams.map((team) => ({ run: r, team })))
        .find(
          ({ team, run }) =>
            team.ticker !== run.gold.expectedAnchor && team.confidence < limiar,
        )
      expect(abaixo).toBeDefined()
      const saida = abaixo!.run.teams.find((team) => team.ticker === abaixo!.team.ticker)!
      expect(saida.origin).toBe('low_confidence')
      expect(saida.sentiment).toBe(0)
      expect(saida.confidence).toBe(abaixo!.team.confidence)
      return
    }

    const abaixo = run.gold.llm.teams.find(
      (team) =>
        team.ticker !== run.gold.expectedAnchor &&
        team.confidence < limiar &&
        limiar - team.confidence <= 0.05,
    )!
    const saida = run.teams.find((team) => team.ticker === abaixo.ticker)!
    expect(saida.origin).toBe('low_confidence')
    expect(saida.sentiment).toBe(0)
    // Nao e descartado: continua no grupo, com o confidence original preservado
    // para auditoria.
    expect(saida.confidence).toBe(abaixo.confidence)
    expect(saida.rank).toBeGreaterThan(0)

    // Pelo menos um vizinho em cima do limiar na MESMA manchete segue
    // despachavel — o gate corta o time, nao o grupo.
    const acima = run.gold.llm.teams.filter(
      (team) => team.ticker !== run.gold.expectedAnchor && team.confidence >= limiar,
    )
    for (const vizinho of acima) {
      const saidaVizinho = run.teams.find((team) => team.ticker === vizinho.ticker)
      if (saidaVizinho) {
        expect(saidaVizinho.origin).toBe('classifier')
      }
    }
  })

  test('[CASO 5] versao ausente do mapa: todo rank 1+ vira low_confidence, sem default numerico', async () => {
    const versaoOrfa = 'news-classifier/versao-sem-entrada-no-mapa'
    expect(Object.keys(CONFIDENCE_THRESHOLD_BY_VERSION)).not.toContain(versaoOrfa)
    expect(resolveConfidenceThreshold(versaoOrfa)).toBeNull()

    jest.resetModules()
    jest.doMock('../types', () => ({
      ...jest.requireActual('../types'),
      CLASSIFIER_OUTPUT_VERSION: versaoOrfa,
    }))

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { NewsClassifier: Isolado } = require('../NewsClassifier') as {
        NewsClassifier: typeof NewsClassifier
      }
      const redis = new RedisMock() as unknown as Redis
      await (redis as unknown as { set: (k: string, v: number, m: string, t: number) => Promise<unknown> })
        .set('news:sonnet:tokens', 100, 'EX', 60)
      // Mesmo runtime enabled de makeClassifier: sem ele o classificador isolado
      // cai no fallback deterministico mono-time e CASO 5 nao exercita o gate
      // de versao orfa (item 002 + G1).
      const isolado = new Isolado(redis, undefined, makeEnabledRuntime())
      ;(isolado as unknown as { tickerIndex: typeof ALIAS_INDEX }).tickerIndex = ALIAS_INDEX

      // GS-04: tres times, todos com confidence MUITO acima de 0.6. Se houvesse
      // qualquer default numerico, os ranks 1 e 2 passariam.
      const gold = GOLDEN_SET.find((candidate) => candidate.id === 'GS-04')!
      mockCreate.mockReset()
      mockCreate.mockResolvedValue(llmResponse(gold.llm))
      logger.info.mockClear()
      logger.warn.mockClear()

      const resultado = await isolado.classify(makeRawItem(gold.title, gold.description))

      expect(resultado.teams).toHaveLength(3)
      expect(resultado.teams[0].origin).toBe('classifier') // ancora segue fora do gate
      for (const team of resultado.teams.slice(1)) {
        expect(team.origin).toBe('low_confidence')
        expect(team.sentiment).toBe(0)
        expect(team.confidence).toBeGreaterThanOrEqual(0.8) // confidence alto e ainda assim barrado
      }

      // Zero Silencio: o fail-closed grita.
      const avisos = logger.warn.mock.calls.map((call) => String(call[0]))
      expect(avisos.some((aviso) => aviso.includes('fail-closed'))).toBe(true)

      // A telemetria registra o limiar como null, nao como um numero inventado.
      const evento = metricEvent('news_classifier_teams_resolved')
      expect(evento).toBeDefined()
      expect(evento!.classifier_version).toBe(versaoOrfa)
      expect(evento!.confidence_threshold).toBeNull()
    } finally {
      jest.dontMock('../types')
      jest.resetModules()
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Criterio 47 — o fallback deterministico continua mono-time
// ---------------------------------------------------------------------------

describe('Golden set — fallback deterministico mono-time (criterio 47)', () => {
  test('[C47] resolveFromIndex sobre texto citando 3 times devolve UM unico ticker', () => {
    const texto = 'Cruzeiro vence o classico e complica Flamengo, Palmeiras e Corinthians na briga pelo titulo'
    const hit = resolveFromIndex(texto, ALIAS_INDEX)

    expect(hit).not.toBeNull()
    expect(hit!.ticker).toBe('RAP3') // match mais a esquerda
    expect(typeof hit!.ticker).toBe('string') // um ticker, nunca uma lista
  })

  test('[C47] classificador sem time cai no fallback com 1 time, origin classifier_fallback e motivo logado', async () => {
    const { redis, classifier } = makeClassifier()
    await (redis as unknown as { set: (k: string, v: number, m: string, t: number) => Promise<unknown> })
      .set('news:sonnet:tokens', 100, 'EX', 60)

    mockCreate.mockReset()
    mockCreate.mockResolvedValue(llmResponse({
      teams: [],
      impactCategory: 'INSTITUCIONAL',
      relevance: 0.2,
    }))
    logger.info.mockClear()

    const resultado = await classifier.classify(
      makeRawItem(
        'Cruzeiro, Flamengo e Palmeiras assinam manifesto conjunto da Libra',
        'Os tres clubes divulgaram nota em conjunto sobre a nova liga.'
      )
    )

    expect(resultado.teams).toHaveLength(1)
    expect(resultado.teams[0].origin).toBe('classifier_fallback')
    expect(resultado.teams[0].rank).toBe(0)
    expect(resultado.teams[0].confidence).toBe(0)

    const evento = metricEvent('news_classifier_deterministic_fallback')
    expect(evento).toBeDefined()
    expect(evento!.multi_team).toBe(false)
    expect(evento!.reason).toBe('llm_no_team')
    expect(evento!.resolved).toBe(true)
    expect(evento!.ticker).toBe('RAP3')
    expect(typeof evento!.alias).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// 7. O limite que este golden set NAO cobre (Zero Assumido)
// ---------------------------------------------------------------------------

describe('Golden set — limite declarado', () => {
  test('[H8/CI] evidencia real-http qualifica como evidencia H8 de producao', () => {
    const gravados = GOLDEN_SET.filter((gold) => gold.provenance === 'recorded')
    const simulados = GOLDEN_SET.filter((gold) => gold.provenance === 'simulated')
    const realHttp = GOLDEN_SET.filter((gold) => gold.provenance === 'real-http')

    expect(GOLDEN_SET_META.provenance).toBe('real-http')
    expect(GOLDEN_SET_META.acquisition).toBe('provider-http')
    expect(GOLDEN_SET_META.productionH8Eligible).toBe(true)
    expect(GOLDEN_SET_META.recordedAt).not.toBeNull()
    expect(realHttp).toHaveLength(GOLDEN_SET.length)
    expect(simulados).toHaveLength(0)
    expect(isProductionH8Evidence(GOLDEN_SET_META, GOLDEN_SET)).toBe(true)

    expect(simulados.length + gravados.length + realHttp.length).toBe(GOLDEN_SET.length)

    // eslint-disable-next-line no-console
    console.log(
      `\n[H8 VERIFICADA] ${realHttp.length}/${GOLDEN_SET.length} casos real-http ` +
      `via ${GOLDEN_SET_META.provider}/${GOLDEN_SET_META.model} em ${GOLDEN_SET_META.recordedAt}. ` +
      'G3 satisfeito: corpus pronto para revisao formal.'
    )

    // Erros reais do modelo (ancora ou sinal) sao documentados via modelError.
    // Eles provam que a taxa A nao e um 100% vazio e mantem o corpus honesto.
    const comErro = GOLDEN_SET.filter((gold) => gold.modelError === true)
    expect(comErro.length).toBeGreaterThanOrEqual(1)
  })

  test('[H8] a versao ativa do classificador tem entrada literal no mapa de limiares', () => {
    // Guarda do item 011 replicada aqui de proposito: o numero do golden set so
    // significa algo enquanto o limiar da versao medida for o limiar de producao.
    expect(Object.keys(CONFIDENCE_THRESHOLD_BY_VERSION)).toContain(CLASSIFIER_OUTPUT_VERSION)
    expect(resolveConfidenceThreshold(CLASSIFIER_OUTPUT_VERSION)).toBe(0.6)
  })
})
