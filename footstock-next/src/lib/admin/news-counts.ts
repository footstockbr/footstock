/**
 * Contrato dos contadores da listagem admin de noticias.
 *
 * Os nomes dos headers moram AQUI, e nao duplicados nos dois lados: o produtor
 * (`src/app/api/v1/admin/news/route.ts`) e o consumidor
 * (`src/app/admin/noticias/page.tsx`) importam as mesmas constantes. Renomear um
 * header vira uma mudanca que os dois lados enxergam, em vez de uma string
 * repetida que some de um lado so e derruba a tela para o fallback em silencio.
 *
 * A decisao de QUAL numero exibir tambem mora aqui, pura e testavel: e ela que
 * impede a tela de anunciar numero de PAGINA como se fosse do ACERVO, que foi o
 * sintoma que originou o T-06 ("o contador de rascunhos fica em zero").
 */

/** Header do T-08: quantas ancoras estao retidas pelo gate editorial. */
export const QUARANTINE_COUNT_HEADER = 'X-Quarantine-Count'

/** Headers do T-06 criterio 3: os tres status contados sobre o acervo inteiro. */
export const PUBLISHED_COUNT_HEADER = 'X-Published-Count'
export const DRAFT_COUNT_HEADER = 'X-Draft-Count'
export const ARCHIVED_COUNT_HEADER = 'X-Archived-Count'

/** Os tres status que o rodape do header da pagina anuncia. */
export interface AcervoCounts {
  published: number
  draft: number
  archived: number
}

/** O que o produtor emite: os tres status mais a quarentena. */
export interface AdminNewsCounts extends AcervoCounts {
  quarantine: number
}

/** Subconjunto de `Headers` usado aqui — mantem a funcao testavel sem `Response`. */
export interface CountHeaderSource {
  get(name: string): string | null
}

/**
 * Le um header de contagem inteira nao-negativa.
 *
 * Devolve `null` quando o header esta ausente (proxy que remove header custom,
 * cliente antigo, mock desatualizado) ou quando o valor e ilegivel. Nunca
 * inventa zero: zero e uma resposta legitima do servidor e confundi-lo com
 * "nao sei" e exatamente o erro que esconde rascunho do operador. O caller
 * decide o fallback e, principalmente, o rotulo que o acompanha.
 *
 * Valor ilegivel LOGA: some do numero, nao some do console (Zero Silencio).
 */
export function readCountHeader(headers: CountHeaderSource, header: string): number | null {
  const raw = headers.get(header)
  if (raw === null) return null
  // `Number('')` e `Number('   ')` valem 0 em JS. Um header presente e vazio
  // significa "o produtor nao soube dizer", e virar zero aqui e exatamente o
  // erro que esconde rascunho do operador — o sintoma que originou o T-06.
  if (raw.trim() === '') {
    console.warn(`[admin/noticias] header ${header} veio vazio; contagem tratada como ausente.`)
    return null
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.warn(`[admin/noticias] header ${header}="${raw}" inválido; contagem tratada como ausente.`)
    return null
  }
  return parsed
}

/**
 * Le os tres contadores de status do acervo.
 *
 * Tudo-ou-nada de proposito: com um header faltando, os tres numeros deixariam
 * de somar `pagination.total` e a linha passaria a misturar denominadores (dois
 * do acervo, um da pagina). Um numero parcialmente do acervo e pior que numero
 * nenhum, porque parece completo.
 */
export function readAcervoCounts(headers: CountHeaderSource): AcervoCounts | null {
  const published = readCountHeader(headers, PUBLISHED_COUNT_HEADER)
  const draft = readCountHeader(headers, DRAFT_COUNT_HEADER)
  const archived = readCountHeader(headers, ARCHIVED_COUNT_HEADER)
  if (published === null || draft === null || archived === null) return null
  return { published, draft, archived }
}

export interface DisplayCountsInput {
  /** Contagens do acervo vindas dos headers, ou `null` quando nao vieram. */
  acervoCounts: AcervoCounts | null
  /** Mesmos predicados aplicados so ao que esta na pagina atual. */
  pageCounts: AcervoCounts
  /**
   * Se a resposta que produziu ESTES numeros veio com a quarentena visivel.
   *
   * Nao e o estado do toggle: e o escopo do fetch que ja completou. Ler o toggle
   * faria o rotulo mudar antes dos numeros, e por um instante a tela afirmaria
   * um recorte que os numeros na tela ainda nao tem.
   */
  includesQuarantine: boolean
}

export interface DisplayCounts {
  counts: AcervoCounts
  /** `acervo` quando os numeros sao do acervo inteiro; `pagina` no fallback. */
  scope: 'acervo' | 'pagina'
  /** Rotulo pronto, ja qualificado pelo recorte da quarentena. */
  scopeLabel: string
}

/**
 * Escolhe entre acervo e pagina e devolve o rotulo que descreve a escolha.
 *
 * O rotulo carrega SEMPRE o recorte da quarentena, com as mesmas palavras do
 * rodape da paginacao: os tres contadores partem do mesmo `where` da listagem,
 * entao com o toggle ligado eles incluem o que o gate editorial reteve. Sem o
 * qualificador, o operador leria "2 rascunhos" como "2 rascunhos publicaveis" e
 * a quarentena somaria de forma invisivel.
 */
export function resolveDisplayCounts({
  acervoCounts,
  pageCounts,
  includesQuarantine,
}: DisplayCountsInput): DisplayCounts {
  const scope = acervoCounts ? 'acervo' : 'pagina'
  const base = acervoCounts ? 'No acervo' : 'Nesta página'
  const quarantineQualifier = includesQuarantine ? 'quarentena incluída' : 'quarentena oculta'
  return {
    counts: acervoCounts ?? pageCounts,
    scope,
    scopeLabel: `${base} (${quarantineQualifier})`,
  }
}
