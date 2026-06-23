// ============================================================================
// FootStock Motor — ticker-fallback (espelho do núcleo determinístico)
//
// CÓPIA ESPELHADA de footstock-next/src/lib/utils/ticker-resolver-core.ts.
// O motor é um pacote separado (build/tsconfig próprios) e não importa de
// footstock-next. A lógica e o AMBIGUITY_DENYLIST DEVEM permanecer byte-idênticos
// ao core do Next. Há um teste de paridade que congela o denylist (ver
// __tests__/ticker-fallback.test.ts). Ao alterar um, alterar o outro.
//
// Uso: quando o classificador LLM devolve ticker vazio, este fallback tenta
// identificar o time pelo TÍTULO de forma determinística e PRECISION-FIRST
// (denylist de palavras comuns + auto-suppressão de colisões + posição à
// esquerda). NÃO altera relevance → não cria impacto de preço espúrio.
// ============================================================================

export const AMBIGUITY_DENYLIST: ReadonlySet<string> = new Set([
  // dicionário / substantivos comuns
  'vitoria', 'coxa', 'celeste', 'glorioso', 'soberano', 'majestoso', 'nacao',
  'fiel', 'papo', 'indio', 'pantera', 'fantasma', 'colorado',
  // sobrenomes / nomes comuns
  'santos', 'coelho',
  // gentílicos / adjetivos regionais
  'americano', 'americas', 'mineiro', 'paranaense', 'pernambucano', 'cearense',
  'cearenses', 'goianienses', 'santistas', 'cruzeirenses', 'palmeirenses',
  'corinthianos', 'bahianos', 'cuiabanos', 'coritibanos', 'avaiano', 'alagoano',
  // locais / regiões
  'goiania', 'campinas', 'florianopolis', 'pantanal', 'capibaribe',
  // siglas / abreviações genéricas e formas ambíguas internacionais
  'abc', 'flu', 'inter', 'sport', 'athletic', 'baenao', 'azulino', 'pajucara',
])

export function normalize(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export type AliasIndex = Array<[alias: string, ticker: string]>

export function buildAliasIndex(
  entries: Array<{ ticker: string; searchText: string | null | undefined }>,
): AliasIndex {
  const aliasToTickers = new Map<string, Set<string>>()
  const raw: AliasIndex = []
  for (const { ticker, searchText } of entries) {
    if (!searchText) continue
    for (const part of searchText.split(/[,;|]+/)) {
      const alias = normalize(part.trim())
      if (alias.length <= 2) continue
      if (AMBIGUITY_DENYLIST.has(alias)) continue
      raw.push([alias, ticker])
      let set = aliasToTickers.get(alias)
      if (!set) { set = new Set(); aliasToTickers.set(alias, set) }
      set.add(ticker)
    }
  }
  const seen = new Set<string>()
  const index: AliasIndex = []
  for (const [alias, ticker] of raw) {
    if ((aliasToTickers.get(alias)?.size ?? 0) > 1) continue
    const key = `${alias} ${ticker}`
    if (seen.has(key)) continue
    seen.add(key)
    index.push([alias, ticker])
  }
  index.sort((a, b) => b[0].length - a[0].length)
  return index
}

export function resolveFromIndex(
  text: string,
  index: AliasIndex,
): { ticker: string; alias: string } | null {
  if (!text?.trim()) return null
  const norm = normalize(text)
  let best: { ticker: string; alias: string; pos: number } | null = null
  for (const [alias, ticker] of index) {
    const re = new RegExp(`(?<![a-z0-9])${escapeRegex(alias)}(?![a-z0-9])`)
    const m = re.exec(norm)
    if (!m) continue
    const pos = m.index
    if (
      best === null ||
      pos < best.pos ||
      (pos === best.pos && alias.length > best.alias.length)
    ) {
      best = { ticker, alias, pos }
    }
  }
  return best ? { ticker: best.ticker, alias: best.alias } : null
}
