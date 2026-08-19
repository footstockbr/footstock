// ============================================================================
// FootStock Motor — Normalização de texto de notícia
//
// Extraído de `RSSFetcher` e `NewsPublisher` no item 011 do loop
// 08-18-foot-stock-motor-noticias-analise (T-10). Motivo: os dois pontos
// precisam responder IDÊNTICO à mesma pergunta ("isto conta como texto
// ausente?") e nenhum dos dois deveria importar o outro por causa dela.
// Duplicar a lista de literais degenerados garante que uma das cópias fique
// para trás na próxima mudança. Precedente do mesmo par de classes:
// `news-dedup.ts`.
//
// Origem medida em produção (T-01, 2026-08-19): a coluna `content` de `news`
// tinha 2003 linhas com o literal `'null'` (ESPN Brasil, produtor parado) e
// 427 linhas com string vazia (O Gol, produtor ATIVO). O `??` de
// `RSSFetcher.ts:106` deixa a string vazia passar, e `'null'` é truthy, então
// nem `??` nem `||` sozinhos fecham as duas classes.
//
// Rastreabilidade: T-10
// ============================================================================

/**
 * Literais que um feed escreve quando não tem o campo, e que precisam contar
 * como ausência em vez de virar conteúdo.
 *
 * Conjunto FECHADO de propósito, exatamente `null` e `undefined`. A medição de
 * produção de T-01 procurou três classes e achou duas; `nan`, `none`, `nil`,
 * `n/a` e `-` não apareceram em nenhuma linha. Ampliar sem evidência é
 * inventar regra — ampliação futura é decisão de outro item, com medição
 * antes. Exportado para o teste poder assertar o conjunto.
 */
export const DEGENERATE_LITERALS: ReadonlySet<string> = new Set(['null', 'undefined'])

/** Entidades HTML tratadas na detecção de vazio (mesmo conjunto do `cleanText`
 *  legado de `RSSFeedParser`, mais `&nbsp;`, que é o caso real de `<p>&nbsp;</p>`). */
const ENTITY_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
]

/**
 * Devolve o texto útil de `value`, ou `undefined` quando o valor é ausência
 * disfarçada: não-string, vazio, só espaços, só tags/entidades, ou um dos
 * literais degenerados.
 *
 * O valor devolvido é o `trim()` do ORIGINAL, com as tags que tinha — NÃO o
 * texto sem markup. T-10 é sobre literal degenerado, não sobre sanitização de
 * HTML do acervo: remover tags aqui mudaria o conteúdo de toda notícia com
 * markup, o que é mudança de outra natureza e com outro aceite. A remoção de
 * tags existe apenas para DECIDIR se sobrou conteúdo real.
 */
export function normalizeNewsText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (DEGENERATE_LITERALS.has(trimmed.toLowerCase())) return undefined

  let stripped = trimmed.replace(/<[^>]*>/g, '')
  for (const [pattern, replacement] of ENTITY_PATTERNS) {
    stripped = stripped.replace(pattern, replacement)
  }
  stripped = stripped.trim()

  if (stripped === '') return undefined
  // Cobre `<p>null</p>`: o literal degenerado escondido atrás de markup.
  if (DEGENERATE_LITERALS.has(stripped.toLowerCase())) return undefined

  return trimmed
}
