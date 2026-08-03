// ============================================================================
// FootStock Motor — Gate editorial de escopo (autoritativo)
//
// Decide se um FATO noticioso pode virar linha PUBLICADA no feed do usuário.
// É o gate AUTORITATIVO: roda no NewsPublisher, antes da persistência, e
// determina o valor de `isPublished`. Os filtros de rota (`GET /api/v1/news`,
// AIAdvisorService) são defense-in-depth, não substituem este.
//
// NÃO confundir com os gates de dispatchGroup():
//   - RELEVANCE_THRESHOLD e o gate de ticker lá dentro suprimem apenas o
//     EVENTO DE PREÇO no Redis. Uma notícia pode ser publicável e não mover
//     preço nenhum — isso é normal e desejado.
//   - Este gate decide VISIBILIDADE. Bloqueou aqui, não há o que despachar.
//
// Este módulo é PURO de propósito: nenhum acesso a Prisma, Redis, rede ou
// relógio. Toda a entrada chega por parâmetro para que o golden set possa
// exercitar a matriz de decisão inteira sem infraestrutura.
// ============================================================================

import { isLlmUnavailableReason, type ClassifierFallbackReason } from './types'

/**
 * Motivo do bloqueio editorial. Persistido em `news.editorial_block_reason`
 * para que o admin veja POR QUE a notícia não está no feed, e para que a
 * telemetria distinga "gate comendo lixo" de "gate comendo notícia legítima".
 */
export type EditorialBlockReason =
  /** O LLM respondeu, foi parseado, e disse que a notícia não afeta clube algum. */
  | 'out_of_scope_llm'
  /** LLM indisponível E o resolvedor determinístico não achou clube local. */
  | 'no_local_team'
  /** Time identificado, mas nenhuma linha resolveu para um asset local existente. */
  | 'asset_unresolved'
  /**
   * LLM indisponível, o resolvedor determinístico ancorou um clube local, MAS o
   * título casa uma pauta reconhecidamente fora de escopo (outro esporte, ação
   * social, leilão). Só existe no modo degradado — com LLM saudável o veredito
   * do modelo é a autoridade e esta heurística não roda.
   */
  | 'out_of_scope_heuristic'

/**
 * Pautas fora de escopo detectáveis sem LLM, avaliadas contra o título já
 * canonizado (minúsculo, sem acento). Usadas SOMENTE no modo degradado.
 *
 * Por que isto existe: com o LLM fora do ar, ancorar um clube local por alias no
 * título é um sinal fraco. "Leilão beneficente tem camisa do Flamengo
 * autografada" ancora em FLA e publicaria — é exatamente a classe do "6º Leilão
 * do Instituto Neymar" que motivou este gate. A menção ao clube é incidental.
 *
 * Precisão acima de cobertura: cada termo é uma pauta que NUNCA move preço de
 * ação de clube. Falso positivo aqui custa uma notícia que o operador republica
 * na mão pelo admin; falso negativo custa lixo no feed do usuário, que é o que
 * estamos consertando. A lista não tenta ser exaustiva — o LLM saudável é quem
 * faz o trabalho fino.
 */
const OUT_OF_SCOPE_TITLE_PATTERNS: readonly RegExp[] = Object.freeze([
  // Outros esportes (o app é mercado de ações de clubes de FUTEBOL).
  /\b(nba|nfl|mlb|nhl)\b/,
  /\b(basquete|basquetebol|volei|voleibol|tenis|handebol|futsal)\b/,
  /\b(formula\s?1|f1|motogp|automobilismo|kart)\b/,
  /\b(ufc|mma|boxe|jiu\s?jitsu|judo|karate|taekwondo)\b/,
  /\b(natacao|atletismo|ginastica|surfe|skate|ciclismo|rugby|golfe|esgrima|remo)\b/,
  /\b(e-?sports|esports|cs2|counter\s?strike|league\s?of\s?legends|valorant)\b/,
  // Pauta social, publicitária ou de arrecadação — menção a clube é incidental.
  /\b(leilao|leiloes|rifa|sorteio|beneficente|filantropic[ao])\b/,
  /\b(instituto)\b/,
])

/**
 * Canonização mínima para casar os padrões acima: minúsculo e sem diacrítico.
 * Deliberadamente NÃO remove pontuação — os padrões usam `\b`, que já trata
 * hífen e vírgula como fronteira.
 */
function canonicalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** O título casa alguma pauta reconhecidamente fora de escopo? */
export function isOutOfScopeByTitle(title: string): boolean {
  const canonical = canonicalizeTitle(title)
  return OUT_OF_SCOPE_TITLE_PATTERNS.some((pattern) => pattern.test(canonical))
}

/** Uma linha planejada, na forma mínima de que o gate precisa. */
export interface EditorialRowView {
  /** Ticker resolvido (pode ser '' quando nada resolveu). */
  ticker: string
  /** ID do asset local, ou null quando o ticker não existe na tabela `assets`. */
  assetId: string | null
}

export interface EditorialDecisionInput {
  /** Motivo do fallback do classificador, quando houve. */
  fallbackReason?: ClassifierFallbackReason | null
  /** Linhas já planejadas e com asset resolvido. */
  rows: readonly EditorialRowView[]
  /**
   * Título da notícia. Só é lido no modo degradado, pela heurística de pauta
   * fora de escopo. Opcional para não quebrar chamador que só exercita a matriz
   * de LLM saudável; ausente equivale a título que não casa nada.
   */
  title?: string
}

export interface EditorialDecision {
  /** `true` = a notícia entra no feed do usuário. */
  publish: boolean
  /** Preenchido apenas quando `publish === false`. */
  blockReason: EditorialBlockReason | null
  /**
   * `true` quando publicamos SEM veredito do LLM, apoiados só no resolvedor
   * determinístico. Publicação em modo degradado NÃO deve despachar impacto de
   * preço — o sentimento e a categoria não são confiáveis nesse estado.
   */
  degraded: boolean
}

/**
 * Regra de escopo, em uma frase: **só publica notícia que ancora em pelo menos
 * um clube que existe neste app.**
 *
 * A tabela `assets` é a definição operacional de "time local" — ela é a mesma
 * fonte que alimenta o índice de aliases do `ticker-fallback.ts`. Um clube
 * europeu, um time de NBA ou um jogador sem clube listado simplesmente não têm
 * ticker resolvível, e por isso caem fora sem precisar de lista de bloqueio.
 * Isso vale tanto com LLM saudável quanto com LLM fora do ar.
 *
 * Matriz de decisão:
 *
 * | LLM respondeu? | teams do LLM | resolvedor determinístico | asset local | resultado |
 * |----------------|--------------|---------------------------|-------------|-----------|
 * | sim            | >= 1 time    | (não usado)               | sim         | publica   |
 * | sim            | >= 1 time    | (não usado)               | não         | bloqueia `asset_unresolved` |
 * | sim            | []           | achou algo (ou não)       | -           | bloqueia `out_of_scope_llm` |
 * | não (degradado)| -            | achou clube local         | sim         | publica DEGRADADO (se o título não casar pauta fora de escopo) |
 * | não (degradado)| -            | achou clube local         | sim         | bloqueia `out_of_scope_heuristic` (título é leilão/outro esporte) |
 * | não (degradado)| -            | nada                      | não         | bloqueia `no_local_team` |
 *
 * A linha 3 é a que mata o Neymar-sem-time e a enxurrada europeia quando o LLM
 * está saudável: `llm_no_team` significa veredito explícito de "não afeta
 * clube nenhum", e o fallback por título NÃO pode ressuscitar a notícia — se
 * pudesse, uma menção incidental a um clube brasileiro numa matéria sobre o
 * Chelsea voltaria a publicar.
 *
 * A linha 4 é a terceira via para o circuito de crédito aberto: em vez de
 * fail-open (o bug de hoje) ou fail-closed (feed vazio), o app continua
 * publicando o que o resolvedor determinístico consegue ancorar num clube
 * local, e só isso.
 */
export function decideEditorialPublication(input: EditorialDecisionInput): EditorialDecision {
  const { fallbackReason = null, rows, title = '' } = input
  const degraded = isLlmUnavailableReason(fallbackReason)

  // Veredito explícito do LLM: fora de escopo. Fallback por título não reverte.
  if (!degraded && fallbackReason === 'llm_no_team') {
    return { publish: false, blockReason: 'out_of_scope_llm', degraded: false }
  }

  const anchored = rows.some((row) => Boolean(row.ticker) && Boolean(row.assetId))
  if (anchored) {
    // Âncora local existe, mas sem LLM ela é sinal fraco: um alias de clube no
    // título de uma pauta de leilão ou de outro esporte não faz da notícia algo
    // que mova a ação. Com LLM saudável esta heurística NÃO roda — o veredito do
    // modelo já é a autoridade e second-guessá-lo suprimiria notícia legítima.
    if (degraded && isOutOfScopeByTitle(title)) {
      return { publish: false, blockReason: 'out_of_scope_heuristic', degraded: true }
    }
    return { publish: true, blockReason: null, degraded }
  }

  // Sem âncora local. O motivo muda conforme tenhamos ou não veredito do LLM:
  // sem LLM é "não deu para saber", com LLM é "o time citado não é daqui".
  return {
    publish: false,
    blockReason: degraded ? 'no_local_team' : 'asset_unresolved',
    degraded,
  }
}
