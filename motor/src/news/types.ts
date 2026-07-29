// ============================================================================
// FootStock Motor — Tipos locais para o módulo de notícias
// ImpactCategory espelhada do schema Prisma (não importar @prisma/client diretamente)
// ============================================================================

/** Categorias de impacto de notícias — INTAKE canônico (espelho do enum Prisma) */
export enum ImpactCategory {
  FINANCEIRA_CRITICA = 'FINANCEIRA_CRITICA',         // +/-5%
  ESPORTIVA_MAJORITARIA = 'ESPORTIVA_MAJORITARIA',   // +/-3%
  MERCADO_ATIVOS = 'MERCADO_ATIVOS',                 // +/-2%
  INTEGRIDADE_SAUDE = 'INTEGRIDADE_SAUDE',           // +/-1.5%
  INSTITUCIONAL = 'INSTITUCIONAL',                   // +/-1%
  ESPORTIVA_MENOR = 'ESPORTIVA_MENOR',               // +/-0.5%
}

/** Magnitude de impacto por categoria (fração do preço) */
export const IMPACT_MAGNITUDE: Record<ImpactCategory, number> = {
  [ImpactCategory.FINANCEIRA_CRITICA]: 0.05,
  [ImpactCategory.ESPORTIVA_MAJORITARIA]: 0.03,
  [ImpactCategory.MERCADO_ATIVOS]: 0.02,
  [ImpactCategory.INTEGRIDADE_SAUDE]: 0.015,
  [ImpactCategory.INSTITUCIONAL]: 0.01,
  [ImpactCategory.ESPORTIVA_MENOR]: 0.005,
}

// ============================================================================
// Contrato de saída do classificador — multi-time (M067, item 011)
// Consumido por NewsClassifier (produtor), NewsPublisher (fan-out, item 013)
// e pelo golden set (item 012).
// ============================================================================

/**
 * Versão do contrato de saída do classificador (schema + prompt + parser).
 * O limiar de `confidence` NÃO é um número global: ele vive no mapa
 * CONFIDENCE_THRESHOLD_BY_VERSION indexado por esta constante. Motivo: o
 * `confidence` só significa algo em relação à calibração do modelo e do prompt
 * que o emitiram; trocar prompt ou modelo sem mexer no mapa invalidaria a
 * calibração em silêncio. Ao mudar prompt/modelo/parser, bumpar esta versão E
 * acrescentar a entrada correspondente no mapa.
 */
export const CLASSIFIER_OUTPUT_VERSION = 'news-classifier/2026-07-28-multi-team'

/** Máximo de times por notícia (tamanho máximo do grupo). Decisão fechada: 3. */
export const MULTI_TEAM_CAP = 3

/**
 * Origem do sinal de cada time.
 * - `classifier`: sinal veio do LLM e é confiável (ou é o rank 0, que não é
 *   gatilhado por confidence).
 * - `low_confidence`: o LLM identificou o time, mas com `confidence` abaixo do
 *   limiar da versão. O time NÃO é descartado: entra no grupo com sentimento
 *   neutro e sem despachar impacto de preço.
 * - `classifier_fallback`: o classificador não devolveu time e o fallback
 *   determinístico (mono-time, por título) resolveu o ticker.
 *
 * A UI e a telemetria leem este campo. NUNCA inferir a causa a partir de
 * `sentiment === 0` sozinho: neutro por decisão do LLM, neutro por confidence
 * baixa e neutro por fallback são três coisas diferentes.
 */
export type TeamSignalOrigin = 'classifier' | 'low_confidence' | 'classifier_fallback'

/** Um time afetado pela notícia. `rank` 0 é a âncora do grupo. */
export interface ClassifiedTeam {
  /** Ticker do ativo afetado (sempre presente e validado contra a lista de tickers). */
  ticker: string
  /** -1.0 a 1.0 para ESTE time. 0 quando neutro (ver `origin` para a causa). */
  sentiment: number
  /** 0.0 a 1.0 — segurança do classificador sobre este time. */
  confidence: number
  /** Posição no grupo. 0 = âncora (primeiro ticker único citado no título). */
  rank: number
  /** Procedência do sinal. Ver TeamSignalOrigin. */
  origin: TeamSignalOrigin
}

/**
 * Saída do classificador para uma notícia.
 *
 * `ticker` e `sentiment` de topo são COMPATIBILIDADE do rank 0: espelham
 * `teams[0]` e existem para o consumidor legado (NewsPublisher single-row).
 * Novo código deve ler `teams[]`.
 */
export interface ClassifiedNews {
  /** Compat rank 0: `teams[0].ticker`, ou '' quando nenhum time foi identificado. */
  ticker: string
  /** Compat rank 0: `teams[0].sentiment`, ou 0 quando nenhum time foi identificado. */
  sentiment: number
  /** ImpactCategory como string (da notícia inteira, não por time). */
  impactCategory: string
  /** 0.0 a 1.0 (da notícia inteira, não por time). */
  relevance: number
  /** Times afetados, ordenados por `rank`. Vazio quando nenhum time foi identificado. */
  teams: ClassifiedTeam[]
}

/**
 * Limiar de confidence POR VERSÃO do classificador. Comparação é `>=`
 * (deliberadamente diferente do `>` estrito de RELEVANCE_THRESHOLD em
 * NewsPublisher; a divergência é intencional e coberta pelo golden set).
 *
 * Aplica-se apenas aos ranks 1 e 2 — os times que não são o sujeito da
 * notícia. O rank 0 segue o gate de publicação existente (ticker resolvido +
 * relevance > 0.3), para que ligar o multi-time não mude o comportamento de
 * notícia mono-time.
 *
 * As chaves deste mapa são LITERAIS de propósito. Se a chave fosse computada a
 * partir de CLASSIFIER_OUTPUT_VERSION, bumpar a versão renomearia a entrada
 * junto e a nova versão herdaria o limiar antigo em silêncio — exatamente o
 * fail-open que o fail-closed abaixo existe para impedir. Bumpar a versão SEM
 * acrescentar a chave literal correspondente aqui é o comportamento desejado:
 * o runtime degrada todo rank 1+ para `low_confidence` e o teste de contrato
 * `versao ativa tem entrada literal no mapa` falha alto.
 */
export const CONFIDENCE_THRESHOLD_BY_VERSION: Readonly<Record<string, number>> = Object.freeze({
  'news-classifier/2026-07-28-multi-team': 0.6,
})

/**
 * Resolve o limiar da versão. FAIL-CLOSED: versão ausente no mapa retorna
 * `null` (e não um default numérico), o que faz todo time de rank 1 ou 2 cair
 * em `low_confidence` e não despachar impacto.
 */
export function resolveConfidenceThreshold(version: string): number | null {
  const threshold = CONFIDENCE_THRESHOLD_BY_VERSION[version]
  return typeof threshold === 'number' && Number.isFinite(threshold) ? threshold : null
}

/**
 * `true` quando o sinal do time pode ser confiado (e portanto despachar
 * impacto). Fail-closed em versão desconhecida ou confidence não numérica.
 */
export function isTeamSignalConfident(
  confidence: number,
  version: string = CLASSIFIER_OUTPUT_VERSION,
): boolean {
  const threshold = resolveConfidenceThreshold(version)
  if (threshold === null) return false
  return Number.isFinite(confidence) && confidence >= threshold
}
