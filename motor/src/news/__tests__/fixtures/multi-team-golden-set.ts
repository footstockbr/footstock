// ============================================================================
// Golden set rotulado — classificador multi-time (item 012, loop
// 07-28-noticias-multi-time-linha-por-time)
//
// PARA QUE SERVE
//   Corpus de 32 manchetes multi-time rotuladas a mao, usado por
//   `NewsClassifier.golden-set.test.ts` para medir ACERTO DE SINAL POR TIME
//   (criterio 31 do desenho, alvo >= 85%) e a TAXA DE `low_confidence` de time
//   legitimo. As duas taxas se movem em direcoes OPOSTAS quando o limiar sobe,
//   por isso as duas sao medidas e registradas separadamente: um limiar que
//   zera o erro de sinal apagando quase todo time secundario derrota o
//   proposito da feature.
//
// O QUE ESTE GOLDEN SET DECIDE — E O QUE ELE NAO DECIDE
//   Ele valida o VALOR do limiar `0.6` da versao corrente. A FORMA foi fechada
//   no item 011 (mapa por versao do classificador, fail-closed, comparacao
//   `>=`, rank 0 fora do gate) e NAO se reabre aqui. Se o sweep mostrar que
//   `0.6` nao sustenta a meta, move-se SO O VALOR da entrada da versao corrente
//   em `CONFIDENCE_THRESHOLD_BY_VERSION`, registrando o numero novo com o dado
//   que o justifica — a forma fica intacta.
//
// LIMITE DECLARADO (Zero Assumido) — LEIA ANTES DE CITAR O PERCENTUAL
//   Todo caso aqui tem `provenance: 'simulated'`: o campo `llm` e a resposta
//   PLAUSIVEL do classificador para aquela manchete, escrita a mao a partir das
//   regras duras da secao 13.3, e NAO uma resposta gravada do Sonnet real.
//   Consequencia: o percentual medido sobre este corpus e FIDELIDADE DE
//   PIPELINE (o pipeline preserva, inverte ou apaga o sinal rotulado?), nao
//   validacao da hipotese H8 (o modelo acerta o sinal por time?). Os tres casos
//   marcados `modelError: true` injetam modos de falha realistas do modelo
//   (RB13) para que o numero nao seja um 100% vazio, mas quem escolhe esses
//   tres e o autor do corpus, nao o modelo.
//   H8 so e verificada com `provenance: 'recorded'`. NAO existe (nem deve
//   existir) um recorder automatico: um script que reconstroi o prompt seria
//   uma segunda copia do prompt do classificador e viraria superficie de drift.
//   O caminho e manual e deliberado — para cada caso: chamar o classificador
//   real com a manchete (chamadas reais, custa dinheiro), colar a resposta
//   recebida em `gold.llm` e trocar `provenance` para `'recorded'`. O runner e
//   agnostico a procedencia (le `gold.llm` sem consultar `provenance`), entao a
//   MESMA suite re-pontua o corpus sem nenhuma linha de codigo nova. Enquanto
//   houver caso `simulated`, a suite diz em voz alta que H8 segue nao
//   verificada. Backlog e criterios de aceite do trabalho de gravacao em
//   `blacksmith/loop-archives/07-28-noticias-multi-time-linha-por-time/H8-GOLDEN-SET-GRAVADO-BACKLOG.md`.
//
// ROTULAGEM (o que cada `expected` significa)
//   'positivo' | 'negativo' | 'neutro' — o time e legitimamente afetado e o
//       sinal esperado e esse. `neutro` inclui o caso de efeito nao claro
//       (regra 13.3: vendedor NEUTRAL quando o efeito nao e claro).
//   'ausente' — o time NAO pode sair do pipeline com sinal despachavel
//       (mencao incidental, comparacao historica, clube dono de jogador
//       emprestado sem obrigacao financeira explicita). Se ele aparecer
//       despachando, conta como ERRO de sinal.
//
// FONTES
//   - Regras duras: `source.md` secao 13.3 (loop 07-28).
//   - Criterio de aceite: `source.md` criterio 31 (>= 85%).
//   - Gatilho de reversao (d) da secao 10.5: abaixo de 85%, o item para.
//   - Tickers: os 40 canonicos de `NewsClassifier.ts` (TICKERS_40), que casam
//     com `footstock-next/prisma/seeds/admin-demo/assets.seed.ts`.
// ============================================================================

/** Caso duro da secao 13.3 que a manchete exercita. */
export type HardCase =
  | 'vitoria_e_derrota'
  | 'venda_para_rival'
  | 'empate_que_elimina'
  | 'lesao_de_emprestado'
  | 'decisao_judicial'
  | 'mencao_incidental'
  | 'ambiguidade'

/** Os QUATRO casos duros nomeados em H8/RB13 — cobertura obrigatoria do corpus. */
export const HARD_CASES_OBRIGATORIOS: readonly HardCase[] = [
  'venda_para_rival',
  'empate_que_elimina',
  'lesao_de_emprestado',
  'decisao_judicial',
] as const

/** Sinal esperado pela rotulagem humana. Ver cabecalho. */
export type ExpectedSignal = 'positivo' | 'negativo' | 'neutro' | 'ausente'

export interface GoldenLabel {
  ticker: string
  expected: ExpectedSignal
  /** Por que este e o rotulo — sempre a regra de 13.3 que o sustenta. */
  why: string
}

/** Item bruto de `teams[]` como o classificador o devolveria. */
export interface GoldenLlmTeam {
  ticker: string
  sentiment: number
  confidence: number
}

export interface GoldenCase {
  id: string
  hardCases: HardCase[]
  title: string
  description: string
  /**
   * Ticker esperado no rank 0. E funcao PURA do titulo (e do corpo como
   * fallback), nunca do confidence — inclusive quando o rank 0 acaba sendo um
   * time que o modelo nao deveria ter devolvido (ver GS-18).
   */
  expectedAnchor: string
  labels: GoldenLabel[]
  llm: {
    teams: GoldenLlmTeam[]
    impactCategory: string
    relevance: number
  }
  provenance: 'simulated' | 'recorded'
  /** `true` quando o `llm` injeta deliberadamente um erro realista do modelo. */
  modelError?: boolean
  note?: string
}

// ---------------------------------------------------------------------------
// Indice de aliases do corpus
//
// Fixture derivada das DUAS fontes que descrevem o mesmo mapa em producao:
// os tickers vem de `assets.seed.ts` (que casa com TICKERS_40 do classificador)
// e o estilo dos aliases (lista separada por virgula, sem acento, lowercase)
// vem de `M047-seed-assets-search-text.sql`, que e o formato que o
// `search_text` tem no banco e que `buildAliasIndex` consome.
//
// Aliases foram escolhidos para sobreviver ao AMBIGUITY_DENYLIST e a
// auto-suppressao de colisoes de `buildAliasIndex`: por isso NAO ha 'santos'
// (denylist), 'inter'/'flu'/'sport'/'colorado'/'coxa'/'celeste' (denylist) nem
// 'tricolor'/'verdao'/'leao' nus (colidiriam entre tickers e seriam dropados).
// ---------------------------------------------------------------------------

export const GOLDEN_ASSET_ALIASES: ReadonlyArray<{ ticker: string; searchText: string }> = [
  { ticker: 'URU3', searchText: 'flamengo, mengao, urubu' },
  { ticker: 'POR3', searchText: 'palmeiras, porco, alviverde' },
  { ticker: 'TIM3', searchText: 'corinthians, timao, sccp' },
  { ticker: 'GAL3', searchText: 'atletico-mg, atletico mineiro, galo' },
  { ticker: 'TRI3', searchText: 'sao paulo, spfc, morumbi, tricolor paulista' },
  { ticker: 'REG3', searchText: 'botafogo, fogao, estrela solitaria' },
  { ticker: 'COL3', searchText: 'internacional, colorado gaucho, beira-rio' },
  { ticker: 'IMO3', searchText: 'gremio, imortal, tricolor gaucho' },
  { ticker: 'RAP3', searchText: 'cruzeiro, raposa, cabuloso' },
  { ticker: 'GUE3', searchText: 'fluminense, tricolor carioca, laranjeiras' },
  { ticker: 'BMP3', searchText: 'bahia, esquadrao de aco, fonte nova' },
  { ticker: 'PEI3', searchText: 'peixe, vila belmiro, alvinegro praiano' },
  { ticker: 'CRZ3', searchText: 'vasco, cruz de malta, sao januario, cruzmaltino' },
  { ticker: 'FUR3', searchText: 'athletico-pr, athletico paranaense, furacao' },
  { ticker: 'LEP3', searchText: 'fortaleza, leao do pici' },
  { ticker: 'VOZ3', searchText: 'ceara, vozao' },
  { ticker: 'COX3', searchText: 'coritiba, coxa-branca, couto pereira' },
  { ticker: 'IND3', searchText: 'juventude, alfredo jaconi' },
]

// ---------------------------------------------------------------------------
// Corpus — 32 manchetes multi-time rotuladas a mao
// ---------------------------------------------------------------------------

export const GOLDEN_SET: readonly GoldenCase[] = [
  // -------------------------------------------------------------------------
  // Vitoria e derrota no mesmo confronto (caso canonico do operador)
  // Regra 13.3: sinais opostos, mesma magnitude.
  // -------------------------------------------------------------------------
  {
    id: 'GS-01',
    hardCases: ['vitoria_e_derrota'],
    title: 'Palmeiras vence o Flamengo por 3 a 1 no Allianz Parque',
    description: 'O Alviverde abriu 3 a 0 ainda no primeiro tempo e o Flamengo descontou no fim.',
    expectedAnchor: 'POR3',
    labels: [
      { ticker: 'POR3', expected: 'positivo', why: '13.3 vitoria/derrota: vencedor positivo' },
      { ticker: 'URU3', expected: 'negativo', why: '13.3 vitoria/derrota: perdedor negativo, mesma magnitude' },
    ],
    llm: {
      teams: [
        { ticker: 'POR3', sentiment: 0.85, confidence: 0.95 },
        { ticker: 'URU3', sentiment: -0.85, confidence: 0.93 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.9,
    },
    provenance: 'simulated',
  },
  {
    id: 'GS-02',
    hardCases: ['vitoria_e_derrota'],
    title: 'Gremio bate o Internacional no Gre-Nal e assume a vice-lideranca',
    description: 'O Imortal venceu por 2 a 0 jogando no Beira-Rio.',
    expectedAnchor: 'IMO3',
    labels: [
      { ticker: 'IMO3', expected: 'positivo', why: '13.3 vitoria/derrota: vencedor positivo' },
      { ticker: 'COL3', expected: 'negativo', why: '13.3 vitoria/derrota: perdedor negativo' },
    ],
    llm: {
      teams: [
        { ticker: 'IMO3', sentiment: 0.8, confidence: 0.94 },
        { ticker: 'COL3', sentiment: -0.8, confidence: 0.92 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.88,
    },
    provenance: 'simulated',
    note: 'O corpo cita um alias do PERDEDOR (beira-rio) antes de qualquer alias do vencedor; a ancora ainda assim vem do titulo.',
  },
  {
    id: 'GS-03',
    hardCases: ['vitoria_e_derrota'],
    title: 'Corinthians perde para o Sao Paulo no Majestoso',
    description: 'O Timao saiu na frente, mas o Tricolor Paulista virou no Morumbi.',
    expectedAnchor: 'TIM3',
    labels: [
      { ticker: 'TIM3', expected: 'negativo', why: '13.3 vitoria/derrota: perdedor negativo, mesmo sendo o sujeito do titulo' },
      { ticker: 'TRI3', expected: 'positivo', why: '13.3 vitoria/derrota: vencedor positivo' },
    ],
    llm: {
      teams: [
        { ticker: 'TIM3', sentiment: -0.75, confidence: 0.9 },
        { ticker: 'TRI3', sentiment: 0.75, confidence: 0.91 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.85,
    },
    provenance: 'simulated',
    note: 'Rank 0 com sinal NEGATIVO — prova que a ancora nao e "o time bem avaliado", e sim o sujeito do titulo.',
  },
  {
    id: 'GS-04',
    hardCases: ['vitoria_e_derrota'],
    title: 'Fluminense vence, Vasco tropeca e Botafogo assume a lideranca',
    description: 'Rodada movimentada no Rio: o Fluminense venceu fora de casa, o Vasco empatou em Sao Januario e o Botafogo chegou a ponta.',
    expectedAnchor: 'GUE3',
    labels: [
      { ticker: 'GUE3', expected: 'positivo', why: 'vitoria propria' },
      { ticker: 'CRZ3', expected: 'negativo', why: 'tropeco proprio, consequencia direta' },
      { ticker: 'REG3', expected: 'positivo', why: 'assumiu a lideranca, consequencia direta' },
    ],
    llm: {
      teams: [
        { ticker: 'GUE3', sentiment: 0.7, confidence: 0.9 },
        { ticker: 'CRZ3', sentiment: -0.4, confidence: 0.82 },
        { ticker: 'REG3', sentiment: 0.6, confidence: 0.88 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.8,
    },
    provenance: 'simulated',
    note: 'Grupo de 3 exatamente no cap — nenhum corte, nenhum log de cap.',
  },
  {
    id: 'GS-05',
    hardCases: ['vitoria_e_derrota'],
    title: 'Cruzeiro vence o classico e complica Flamengo, Palmeiras e Corinthians na briga pelo titulo',
    description: 'A Raposa colou nos lideres e deixou os tres rivais diretos em situacao pior na disputa.',
    expectedAnchor: 'RAP3',
    labels: [
      { ticker: 'RAP3', expected: 'positivo', why: 'vitoria propria' },
      { ticker: 'URU3', expected: 'negativo', why: 'consequencia direta na disputa do titulo' },
      { ticker: 'POR3', expected: 'negativo', why: 'consequencia direta na disputa do titulo' },
      { ticker: 'TIM3', expected: 'negativo', why: 'consequencia direta na disputa do titulo' },
    ],
    llm: {
      teams: [
        { ticker: 'RAP3', sentiment: 0.7, confidence: 0.9 },
        { ticker: 'URU3', sentiment: -0.3, confidence: 0.85 },
        { ticker: 'POR3', sentiment: -0.3, confidence: 0.6 },
        { ticker: 'TIM3', sentiment: -0.3, confidence: 0.8 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.82,
    },
    provenance: 'simulated',
    note: '4 times legitimos: o cap de 3 corta o de menor confidence (POR3). O corte NAO conta como erro de sinal; entra na taxa de corte por cap.',
  },
  {
    id: 'GS-06',
    hardCases: ['vitoria_e_derrota'],
    title: 'Bahia surpreende o Atletico-MG na Fonte Nova',
    description: 'O Esquadrao de Aco venceu por 1 a 0 com gol no fim.',
    expectedAnchor: 'BMP3',
    labels: [
      { ticker: 'BMP3', expected: 'positivo', why: 'vitoria propria' },
      { ticker: 'GAL3', expected: 'negativo', why: 'derrota propria' },
    ],
    llm: {
      teams: [
        { ticker: 'BMP3', sentiment: 0.6, confidence: 0.45 },
        { ticker: 'GAL3', sentiment: -0.6, confidence: 0.9 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.75,
    },
    provenance: 'simulated',
    note: 'O time do titulo tem a MENOR confidence do grupo (0.45 < 0.6) e mesmo assim e rank 0 e mantem o sinal — a ancora esta fora do gate de confidence.',
  },

  // -------------------------------------------------------------------------
  // Venda de jogador para rival (CASO DURO 1/4)
  // Regra 13.3: comprador positivo se houver reforco material; vendedor
  // negativo se houver perda material; se o efeito nao for claro, vendedor
  // NEUTRAL.
  // -------------------------------------------------------------------------
  {
    id: 'GS-07',
    hardCases: ['venda_para_rival'],
    title: 'Flamengo contrata meia do Palmeiras por R$ 40 milhoes',
    description: 'O Mengao anunciou o reforco; o Palmeiras perde o principal armador da temporada.',
    expectedAnchor: 'URU3',
    labels: [
      { ticker: 'URU3', expected: 'positivo', why: '13.3 venda para rival: comprador positivo, reforco material explicito' },
      { ticker: 'POR3', expected: 'negativo', why: '13.3 venda para rival: vendedor negativo, perda material explicita' },
    ],
    llm: {
      teams: [
        { ticker: 'URU3', sentiment: 0.7, confidence: 0.92 },
        { ticker: 'POR3', sentiment: -0.55, confidence: 0.8 },
      ],
      impactCategory: 'MERCADO_ATIVOS',
      relevance: 0.8,
    },
    provenance: 'simulated',
  },
  {
    id: 'GS-08',
    hardCases: ['venda_para_rival'],
    title: 'Corinthians vende lateral reserva ao Sao Paulo',
    description: 'O jogador nao era titular no Timao; o Tricolor Paulista buscava opcao para o setor.',
    expectedAnchor: 'TIM3',
    labels: [
      { ticker: 'TIM3', expected: 'neutro', why: '13.3 venda para rival: efeito nao claro para o vendedor (reserva) -> NEUTRAL' },
      { ticker: 'TRI3', expected: 'positivo', why: '13.3 venda para rival: comprador com reforco material' },
    ],
    llm: {
      teams: [
        { ticker: 'TIM3', sentiment: 0, confidence: 0.55 },
        { ticker: 'TRI3', sentiment: 0.35, confidence: 0.7 },
      ],
      impactCategory: 'MERCADO_ATIVOS',
      relevance: 0.6,
    },
    provenance: 'simulated',
    note: 'Ancora com confidence abaixo do limiar mantem o proprio NEUTRAL: neutro por decisao do modelo, nao por low_confidence.',
  },
  {
    id: 'GS-09',
    hardCases: ['venda_para_rival'],
    title: 'Gremio acerta a contratacao do artilheiro do Internacional',
    description: 'O Imortal fechou com o goleador que era o principal nome do rival na temporada.',
    expectedAnchor: 'IMO3',
    labels: [
      { ticker: 'IMO3', expected: 'positivo', why: '13.3 venda para rival: comprador com reforco material' },
      { ticker: 'COL3', expected: 'negativo', why: '13.3 venda para rival: vendedor com perda material' },
    ],
    llm: {
      teams: [
        { ticker: 'IMO3', sentiment: 0.75, confidence: 0.9 },
        { ticker: 'COL3', sentiment: -0.7, confidence: 0.88 },
      ],
      impactCategory: 'MERCADO_ATIVOS',
      relevance: 0.82,
    },
    provenance: 'simulated',
  },
  {
    id: 'GS-10',
    hardCases: ['venda_para_rival', 'ambiguidade'],
    title: 'Peixe negocia zagueiro com o Vasco sem definicao de valores',
    description: 'As conversas seguem sem acordo financeiro; nenhum dos clubes confirmou proposta formal.',
    expectedAnchor: 'PEI3',
    labels: [
      { ticker: 'PEI3', expected: 'neutro', why: '13.3 venda para rival: efeito nao claro -> vendedor NEUTRAL' },
      { ticker: 'CRZ3', expected: 'neutro', why: '13.3 ambiguidade: negocio sem valores e sem confirmacao nao e reforco material' },
    ],
    llm: {
      teams: [
        { ticker: 'PEI3', sentiment: 0, confidence: 0.5 },
        { ticker: 'CRZ3', sentiment: 0.5, confidence: 0.8 },
      ],
      impactCategory: 'MERCADO_ATIVOS',
      relevance: 0.5,
    },
    provenance: 'simulated',
    modelError: true,
    note: 'ERRO DE MODELO INJETADO (RB13): o classificador trata negocio sem valores como reforco material e devolve CRZ3 positivo com confidence alta. O limiar nao protege contra erro CONFIANTE — este e o modo de falha que a taxa de acerto existe para medir.',
  },
  {
    id: 'GS-11',
    hardCases: ['venda_para_rival'],
    title: 'Fluminense empresta atacante ao Ceara com opcao de compra',
    description: 'O Vozao fica com o jogador ate o fim da temporada e pode compra-lo ao final.',
    expectedAnchor: 'GUE3',
    labels: [
      { ticker: 'GUE3', expected: 'neutro', why: '13.3 venda para rival: emprestimo com opcao (nao obrigacao) deixa o efeito do cedente nao claro -> NEUTRAL' },
      { ticker: 'VOZ3', expected: 'positivo', why: '13.3 venda para rival: quem recebe o jogador tem reforco material imediato' },
    ],
    llm: {
      teams: [
        { ticker: 'GUE3', sentiment: 0, confidence: 0.6 },
        { ticker: 'VOZ3', sentiment: 0.45, confidence: 0.75 },
      ],
      impactCategory: 'MERCADO_ATIVOS',
      relevance: 0.55,
    },
    provenance: 'simulated',
  },

  // -------------------------------------------------------------------------
  // Empate que elimina os dois (CASO DURO 2/4)
  // Regra 13.3: ambos negativos.
  // -------------------------------------------------------------------------
  {
    id: 'GS-12',
    hardCases: ['empate_que_elimina'],
    title: 'Empate entre Corinthians e Vasco elimina os dois da Copa do Brasil',
    description: 'O 1 a 1 em Itaquera nao serviu para nenhum dos lados.',
    expectedAnchor: 'TIM3',
    labels: [
      { ticker: 'TIM3', expected: 'negativo', why: '13.3 empate que elimina: ambos negativos' },
      { ticker: 'CRZ3', expected: 'negativo', why: '13.3 empate que elimina: ambos negativos' },
    ],
    llm: {
      teams: [
        { ticker: 'TIM3', sentiment: -0.7, confidence: 0.9 },
        { ticker: 'CRZ3', sentiment: -0.7, confidence: 0.9 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.85,
    },
    provenance: 'simulated',
    note: 'Contra-exemplo do desenho A: um unico registro com um unico sentimento nao consegue representar dois negativos sem inverter um deles.',
  },
  {
    id: 'GS-13',
    hardCases: ['empate_que_elimina'],
    title: 'Athletico-PR e Fortaleza ficam no 0 a 0 e dao adeus a Sul-Americana',
    description: 'O Furacao precisava vencer; o Leao do Pici tambem.',
    expectedAnchor: 'FUR3',
    labels: [
      { ticker: 'FUR3', expected: 'negativo', why: '13.3 empate que elimina: ambos negativos' },
      { ticker: 'LEP3', expected: 'negativo', why: '13.3 empate que elimina: ambos negativos' },
    ],
    llm: {
      teams: [
        { ticker: 'FUR3', sentiment: -0.65, confidence: 0.88 },
        { ticker: 'LEP3', sentiment: -0.65, confidence: 0.87 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.78,
    },
    provenance: 'simulated',
  },
  {
    id: 'GS-14',
    hardCases: ['empate_que_elimina'],
    title: 'Empate sem gols elimina os dois finalistas',
    description: 'O Ceara nao passou do 0 a 0 e o Bahia tambem ficou pelo caminho.',
    expectedAnchor: 'VOZ3',
    labels: [
      { ticker: 'VOZ3', expected: 'negativo', why: '13.3 empate que elimina: ambos negativos' },
      { ticker: 'BMP3', expected: 'negativo', why: '13.3 empate que elimina: ambos negativos' },
    ],
    llm: {
      teams: [
        { ticker: 'BMP3', sentiment: -0.6, confidence: 0.85 },
        { ticker: 'VOZ3', sentiment: -0.6, confidence: 0.86 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.76,
    },
    provenance: 'simulated',
    note: 'Titulo NAO resolve ticker; a ancora vem do CORPO (Ceara aparece antes de Bahia). A ordem da resposta do LLM esta deliberadamente invertida: um parser que caisse em candidates[0] devolveria BMP3.',
  },
  {
    id: 'GS-15',
    hardCases: ['empate_que_elimina'],
    title: 'Palmeiras e Gremio empatam e ambos ficam fora do mata-mata',
    description: 'O 2 a 2 no Allianz eliminou os dois da competicao.',
    expectedAnchor: 'POR3',
    labels: [
      { ticker: 'POR3', expected: 'negativo', why: '13.3 empate que elimina: ambos negativos' },
      { ticker: 'IMO3', expected: 'negativo', why: '13.3 empate que elimina: ambos negativos' },
    ],
    llm: {
      teams: [
        { ticker: 'POR3', sentiment: -0.6, confidence: 0.9 },
        { ticker: 'IMO3', sentiment: -0.6, confidence: 0.9 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.8,
    },
    provenance: 'simulated',
  },

  // -------------------------------------------------------------------------
  // Lesao de jogador emprestado (CASO DURO 3/4)
  // Regra 13.3: impacta o clube onde ele joga; o clube dono so entra se houver
  // obrigacao financeira ou contratual explicita na materia.
  // -------------------------------------------------------------------------
  {
    id: 'GS-16',
    hardCases: ['lesao_de_emprestado'],
    title: 'Atacante emprestado pelo Palmeiras sofre lesao grave no Bahia',
    description: 'O jogador rompeu o ligamento e desfalca o Esquadrao de Aco por seis meses. Nao ha clausula de obrigacao de compra no contrato.',
    expectedAnchor: 'BMP3',
    labels: [
      { ticker: 'BMP3', expected: 'negativo', why: '13.3 lesao de emprestado: impacta o clube ONDE ELE JOGA' },
      { ticker: 'POR3', expected: 'ausente', why: '13.3 lesao de emprestado: clube dono sem obrigacao financeira explicita NAO entra' },
    ],
    llm: {
      teams: [{ ticker: 'BMP3', sentiment: -0.7, confidence: 0.88 }],
      impactCategory: 'INTEGRIDADE_SAUDE',
      relevance: 0.6,
    },
    provenance: 'simulated',
    note: 'O clube dono aparece PRIMEIRO no titulo e ainda assim nao pode virar rank 0: ele nem sequer e candidato.',
  },
  {
    id: 'GS-17',
    hardCases: ['lesao_de_emprestado'],
    title: 'Gremio ve clausula de compra obrigatoria ser acionada apos lesao de zagueiro no Cruzeiro',
    description: 'O contrato previa compra obrigatoria por numero de jogos; o zagueiro atingiu a meta e se lesionou em seguida.',
    expectedAnchor: 'IMO3',
    labels: [
      { ticker: 'IMO3', expected: 'positivo', why: '13.3 lesao de emprestado: clube dono ENTRA porque ha obrigacao contratual explicita, e a consequencia direta para ele e receber a compra' },
      { ticker: 'RAP3', expected: 'negativo', why: '13.3 lesao de emprestado: impacta o clube onde ele joga, que ainda fica obrigado a comprar o lesionado' },
    ],
    llm: {
      teams: [
        { ticker: 'IMO3', sentiment: 0.5, confidence: 0.8 },
        { ticker: 'RAP3', sentiment: -0.6, confidence: 0.85 },
      ],
      impactCategory: 'INTEGRIDADE_SAUDE',
      relevance: 0.7,
    },
    provenance: 'simulated',
    note: 'Par simetrico do GS-16: mesma familia de manchete, rotulo do clube dono muda porque a obrigacao contratual e explicita.',
  },
  {
    id: 'GS-18',
    hardCases: ['lesao_de_emprestado'],
    title: 'Meia emprestado pelo Flamengo fratura o tornozelo no Fortaleza',
    description: 'Sem clausula financeira envolvida, o Leao do Pici perde o titular por tres meses.',
    expectedAnchor: 'URU3',
    labels: [
      { ticker: 'LEP3', expected: 'negativo', why: '13.3 lesao de emprestado: impacta o clube onde ele joga' },
      { ticker: 'URU3', expected: 'ausente', why: '13.3 lesao de emprestado: clube dono sem obrigacao financeira explicita NAO entra' },
    ],
    llm: {
      teams: [
        { ticker: 'URU3', sentiment: -0.4, confidence: 0.8 },
        { ticker: 'LEP3', sentiment: -0.7, confidence: 0.9 },
      ],
      impactCategory: 'INTEGRIDADE_SAUDE',
      relevance: 0.62,
    },
    provenance: 'simulated',
    modelError: true,
    note: 'ERRO DE MODELO INJETADO (RB13): o classificador inclui o clube dono sem obrigacao explicita. O `expectedAnchor` e URU3 porque a ancora e funcao pura do titulo entre os CANDIDATOS — o pipeline age certo sobre uma entrada errada. Efeito colateral que a suite documenta: um falso positivo que vira ancora fica ISENTO do limiar e despacha.',
  },
  {
    id: 'GS-19',
    hardCases: ['lesao_de_emprestado'],
    title: 'Goleiro emprestado pelo Internacional se machuca no Juventude',
    description: 'O Juventude perde o titular sem previsao de retorno; nao ha obrigacao financeira prevista no emprestimo.',
    expectedAnchor: 'IND3',
    labels: [
      { ticker: 'IND3', expected: 'negativo', why: '13.3 lesao de emprestado: impacta o clube onde ele joga' },
      { ticker: 'COL3', expected: 'ausente', why: '13.3 lesao de emprestado: clube dono sem obrigacao financeira explicita NAO entra' },
    ],
    llm: {
      teams: [{ ticker: 'IND3', sentiment: -0.55, confidence: 0.86 }],
      impactCategory: 'INTEGRIDADE_SAUDE',
      relevance: 0.5,
    },
    provenance: 'simulated',
  },

  // -------------------------------------------------------------------------
  // Decisao judicial ou administrativa (CASO DURO 4/4)
  // Regra 13.3: sentimento pela consequencia direta, nunca por mencao
  // incidental.
  // -------------------------------------------------------------------------
  {
    id: 'GS-20',
    hardCases: ['decisao_judicial'],
    title: 'STJD pune o Corinthians com perda de tres pontos e beneficia o Botafogo',
    description: 'A perda de pontos tira o Timao do G4 e coloca o Botafogo na zona de classificacao.',
    expectedAnchor: 'TIM3',
    labels: [
      { ticker: 'TIM3', expected: 'negativo', why: '13.3 decisao judicial: consequencia direta (perda de pontos)' },
      { ticker: 'REG3', expected: 'positivo', why: '13.3 decisao judicial: consequencia direta (entra na zona de classificacao)' },
    ],
    llm: {
      teams: [
        { ticker: 'TIM3', sentiment: -0.8, confidence: 0.92 },
        { ticker: 'REG3', sentiment: 0.5, confidence: 0.8 },
      ],
      impactCategory: 'INSTITUCIONAL',
      relevance: 0.75,
    },
    provenance: 'simulated',
  },
  {
    id: 'GS-21',
    hardCases: ['decisao_judicial', 'ambiguidade'],
    title: 'CBF anula jogo entre Vasco e Fluminense e manda repetir a partida',
    description: 'A decisao administrativa nao define vencedor; os dois clubes voltam a campo na proxima janela.',
    expectedAnchor: 'CRZ3',
    labels: [
      { ticker: 'CRZ3', expected: 'neutro', why: '13.3 ambiguidade: repeticao de partida nao tem consequencia direta definida' },
      { ticker: 'GUE3', expected: 'neutro', why: '13.3 ambiguidade: repeticao de partida nao tem consequencia direta definida' },
    ],
    llm: {
      teams: [
        { ticker: 'CRZ3', sentiment: 0, confidence: 0.5 },
        { ticker: 'GUE3', sentiment: 0, confidence: 0.5 },
      ],
      impactCategory: 'INSTITUCIONAL',
      relevance: 0.5,
    },
    provenance: 'simulated',
    note: 'Mesmo confidence nos dois times, tratamento DIFERENTE: a ancora despacha NEUTRAL de decisao, o rank 1 vira low_confidence. Entra na taxa B.',
  },
  {
    id: 'GS-22',
    hardCases: ['decisao_judicial'],
    title: 'Justica libera Athletico-PR a inscrever reforco e nega recurso do Coritiba',
    description: 'O Furacao podera escalar o meia no classico; o Coritiba teve o pedido negado.',
    expectedAnchor: 'FUR3',
    labels: [
      { ticker: 'FUR3', expected: 'positivo', why: '13.3 decisao judicial: consequencia direta favoravel' },
      { ticker: 'COX3', expected: 'negativo', why: '13.3 decisao judicial: consequencia direta desfavoravel' },
    ],
    llm: {
      teams: [
        { ticker: 'FUR3', sentiment: 0.6, confidence: 0.85 },
        { ticker: 'COX3', sentiment: -0.45, confidence: 0.78 },
      ],
      impactCategory: 'INSTITUCIONAL',
      relevance: 0.65,
    },
    provenance: 'simulated',
  },
  {
    id: 'GS-23',
    hardCases: ['decisao_judicial', 'mencao_incidental'],
    title: 'Tribunal mantem punicao ao clube da Vila Belmiro; caso lembra o do Flamengo em 2019',
    description: 'O Peixe segue sem mando de campo. A comparacao com o Flamengo e apenas historica.',
    expectedAnchor: 'PEI3',
    labels: [
      { ticker: 'PEI3', expected: 'negativo', why: '13.3 decisao judicial: consequencia direta (segue sem mando)' },
      { ticker: 'URU3', expected: 'ausente', why: '13.3 decisao judicial: mencao incidental (comparacao historica) NAO gera linha' },
    ],
    llm: {
      teams: [{ ticker: 'PEI3', sentiment: -0.6, confidence: 0.85 }],
      impactCategory: 'INSTITUCIONAL',
      relevance: 0.6,
    },
    provenance: 'simulated',
  },

  // -------------------------------------------------------------------------
  // Mencao incidental (tabela, historico, comparacao)
  // Regra 13.3: nao gera linha.
  // -------------------------------------------------------------------------
  {
    id: 'GS-24',
    hardCases: ['mencao_incidental'],
    title: 'Cruzeiro assume a lideranca; Palmeiras e o segundo e Flamengo o terceiro na tabela',
    description: 'A Raposa chegou aos 50 pontos. Palmeiras e Flamengo aparecem logo atras na classificacao.',
    expectedAnchor: 'RAP3',
    labels: [
      { ticker: 'RAP3', expected: 'positivo', why: 'consequencia direta: assumiu a lideranca' },
      { ticker: 'POR3', expected: 'ausente', why: '13.3 mencao incidental: posicao na tabela nao gera linha' },
      { ticker: 'URU3', expected: 'ausente', why: '13.3 mencao incidental: posicao na tabela nao gera linha' },
    ],
    llm: {
      teams: [{ ticker: 'RAP3', sentiment: 0.6, confidence: 0.87 }],
      impactCategory: 'ESPORTIVA_MENOR',
      relevance: 0.55,
    },
    provenance: 'simulated',
    note: 'Manchete com 3 clubes no titulo que deve virar grupo UNITARIO.',
  },
  {
    id: 'GS-25',
    hardCases: ['mencao_incidental'],
    title: 'Botafogo vence e iguala campanha historica do Corinthians de 2015',
    description: 'O Fogao chegou a mesma pontuacao que o Timao fez no returno de 2015.',
    expectedAnchor: 'REG3',
    labels: [
      { ticker: 'REG3', expected: 'positivo', why: 'vitoria propria' },
      { ticker: 'TIM3', expected: 'ausente', why: '13.3 mencao incidental: comparacao historica nao gera linha' },
    ],
    llm: {
      teams: [
        { ticker: 'REG3', sentiment: 0.65, confidence: 0.9 },
        { ticker: 'TIM3', sentiment: 0, confidence: 0.7 },
      ],
      impactCategory: 'ESPORTIVA_MENOR',
      relevance: 0.5,
    },
    provenance: 'simulated',
    modelError: true,
    note: 'ERRO DE MODELO INJETADO (RB13): o classificador gera linha para uma comparacao historica. Sentimento 0 NAO absolve: a linha existe, ocupa vaga no grupo e vira badge no card. E por isso que "ausente" e um rotulo, e nao o mesmo que "neutro".',
  },
  {
    id: 'GS-26',
    hardCases: ['mencao_incidental', 'vitoria_e_derrota'],
    title: 'Fortaleza vence o Ceara em classico que reeditou a final de 2019',
    description: 'O Leao do Pici bateu o Vozao por 2 a 1 no Castelao.',
    expectedAnchor: 'LEP3',
    labels: [
      { ticker: 'LEP3', expected: 'positivo', why: 'vitoria propria; a referencia a 2019 e incidental mas os dois clubes sao participantes reais' },
      { ticker: 'VOZ3', expected: 'negativo', why: 'derrota propria' },
    ],
    llm: {
      teams: [
        { ticker: 'LEP3', sentiment: 0.7, confidence: 0.9 },
        { ticker: 'VOZ3', sentiment: -0.7, confidence: 0.89 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.72,
    },
    provenance: 'simulated',
    note: 'Contraponto do GS-25: aqui a referencia historica NAO deve suprimir os times, porque eles sao os sujeitos do jogo.',
  },

  // -------------------------------------------------------------------------
  // Ambiguidade
  // Regra 13.3: NEUTRAL com confidence baixa, sem impacto de preco.
  // -------------------------------------------------------------------------
  {
    id: 'GS-27',
    hardCases: ['ambiguidade'],
    title: 'Diretoria do Vasco e empresario ligado ao Flamengo trocam farpas sobre negociacao travada',
    description: 'Nenhum dos lados confirmou proposta formal; o negocio pode nao sair.',
    expectedAnchor: 'CRZ3',
    labels: [
      { ticker: 'CRZ3', expected: 'neutro', why: '13.3 ambiguidade: NEUTRAL com confidence baixa' },
      { ticker: 'URU3', expected: 'neutro', why: '13.3 ambiguidade: NEUTRAL com confidence baixa' },
    ],
    llm: {
      teams: [
        { ticker: 'CRZ3', sentiment: 0, confidence: 0.4 },
        { ticker: 'URU3', sentiment: 0, confidence: 0.3 },
      ],
      impactCategory: 'MERCADO_ATIVOS',
      relevance: 0.4,
    },
    provenance: 'simulated',
  },
  {
    id: 'GS-28',
    hardCases: ['ambiguidade'],
    title: 'Rumor de troca de treinadores entre Gremio e Internacional agita o mercado',
    description: 'Nenhum dos clubes confirmou conversas.',
    expectedAnchor: 'IMO3',
    labels: [
      { ticker: 'IMO3', expected: 'neutro', why: '13.3 ambiguidade: NEUTRAL com confidence baixa' },
      { ticker: 'COL3', expected: 'neutro', why: '13.3 ambiguidade: NEUTRAL com confidence baixa' },
    ],
    llm: {
      teams: [
        { ticker: 'IMO3', sentiment: 0, confidence: 0.5 },
        { ticker: 'COL3', sentiment: 0, confidence: 0.55 },
      ],
      impactCategory: 'INSTITUCIONAL',
      relevance: 0.45,
    },
    provenance: 'simulated',
  },
  {
    id: 'GS-29',
    hardCases: ['venda_para_rival', 'ambiguidade'],
    title: 'Sao Paulo negocia com o Bahia por atacante e acordo esta proximo',
    description: 'O Tricolor Paulista tem prioridade na negociacao; o Bahia ainda avalia a proposta.',
    expectedAnchor: 'TRI3',
    labels: [
      { ticker: 'TRI3', expected: 'positivo', why: '13.3 venda para rival: comprador prestes a fechar reforco' },
      { ticker: 'BMP3', expected: 'neutro', why: '13.3 ambiguidade: vendedor ainda avaliando -> efeito nao claro' },
    ],
    llm: {
      teams: [
        { ticker: 'TRI3', sentiment: 0.5, confidence: 0.8 },
        { ticker: 'BMP3', sentiment: 0, confidence: 0.6 },
      ],
      impactCategory: 'MERCADO_ATIVOS',
      relevance: 0.55,
    },
    provenance: 'simulated',
    note: 'FRONTEIRA DO LIMIAR: BMP3 tem confidence EXATAMENTE 0.6. A comparacao e `>=`, entao ele passa e permanece origin=classifier.',
  },

  // -------------------------------------------------------------------------
  // Cap, ancora e ordem do grupo
  // -------------------------------------------------------------------------
  {
    id: 'GS-30',
    hardCases: ['vitoria_e_derrota'],
    title: 'Coritiba vence o Flamengo, e Palmeiras e Corinthians perdem terreno',
    description: 'O Coxa-Branca surpreendeu no Couto Pereira e embolou a briga na parte de cima.',
    expectedAnchor: 'COX3',
    labels: [
      { ticker: 'COX3', expected: 'positivo', why: 'vitoria propria' },
      { ticker: 'URU3', expected: 'negativo', why: 'derrota propria' },
      { ticker: 'POR3', expected: 'negativo', why: 'consequencia direta na briga da parte de cima' },
      { ticker: 'TIM3', expected: 'negativo', why: 'consequencia direta na briga da parte de cima' },
    ],
    llm: {
      teams: [
        { ticker: 'COX3', sentiment: 0.6, confidence: 0.45 },
        { ticker: 'URU3', sentiment: -0.6, confidence: 0.95 },
        { ticker: 'POR3', sentiment: -0.35, confidence: 0.9 },
        { ticker: 'TIM3', sentiment: -0.3, confidence: 0.5 },
      ],
      impactCategory: 'ESPORTIVA_MAJORITARIA',
      relevance: 0.7,
    },
    provenance: 'simulated',
    note: 'Combina os dois limites num caso so: 4 times E o time do titulo com a MENOR confidence (0.45). A ancora sobrevive ao corte por direito; o cortado e o de menor confidence entre os NAO-ancora (TIM3, 0.5).',
  },
  {
    id: 'GS-31',
    hardCases: ['venda_para_rival', 'ambiguidade'],
    title: 'Athletico-PR e Gremio disputam a contratacao do meia do Ceara',
    description: 'Os dois clubes fizeram propostas; o Ceara ainda nao aceitou nenhuma delas.',
    expectedAnchor: 'FUR3',
    labels: [
      { ticker: 'FUR3', expected: 'neutro', why: '13.3 ambiguidade: disputa sem desfecho nao e reforco material' },
      { ticker: 'IMO3', expected: 'neutro', why: '13.3 ambiguidade: disputa sem desfecho nao e reforco material' },
      { ticker: 'VOZ3', expected: 'neutro', why: '13.3 venda para rival: vendedor sem acordo aceito -> efeito nao claro' },
    ],
    llm: {
      teams: [
        { ticker: 'FUR3', sentiment: 0, confidence: 0.6 },
        { ticker: 'IMO3', sentiment: 0, confidence: 0.55 },
        { ticker: 'VOZ3', sentiment: 0, confidence: 0.65 },
      ],
      impactCategory: 'MERCADO_ATIVOS',
      relevance: 0.5,
    },
    provenance: 'simulated',
    note: 'Grupo de 3 em que um rank nao-ancora fica logo ABAIXO do limiar (0.55) e os outros ficam em cima (0.6 e 0.65) — as tres faixas do gate num caso so.',
  },
  {
    id: 'GS-32',
    hardCases: ['decisao_judicial'],
    title: 'Bahia e Fortaleza sao punidos por confusao e perdem mando de campo',
    description: 'A decisao administrativa atinge os dois clubes na mesma rodada.',
    expectedAnchor: 'BMP3',
    labels: [
      { ticker: 'BMP3', expected: 'negativo', why: '13.3 decisao judicial: consequencia direta (perde mando)' },
      { ticker: 'LEP3', expected: 'negativo', why: '13.3 decisao judicial: consequencia direta (perde mando)' },
    ],
    llm: {
      teams: [
        { ticker: 'BMP3', sentiment: -0.5, confidence: 0.85 },
        { ticker: 'LEP3', sentiment: -0.5, confidence: 0.85 },
      ],
      impactCategory: 'INSTITUCIONAL',
      relevance: 0.6,
    },
    provenance: 'simulated',
  },
]

/** Alvo do criterio 31 / gatilho de reversao (d) da secao 10.5. */
export const SIGNAL_ACCURACY_TARGET = 0.85

/** Minimo de manchetes multi-time exigido pelo item 012. */
export const GOLDEN_SET_MIN_SIZE = 30

/** Limiares varridos para provar que o valor 0.6 sustenta a meta. */
export const THRESHOLD_SWEEP: readonly number[] = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75]
