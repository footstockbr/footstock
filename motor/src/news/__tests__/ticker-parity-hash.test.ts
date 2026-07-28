// ============================================================================
// Testes — paridade por hash do bloco compartilhado (item 003, loop
// 07-28-noticias-multi-time-linha-por-time, achado F18)
//
// Guarda estrutural: calcula o hash SHA-256 do bloco compartilhado (do
// marcador `export const AMBIGUITY_DENYLIST` até o fim do arquivo) nos dois
// lados do espelho (footstock-next/ticker-resolver-core.ts e
// motor/ticker-fallback.ts) e falha se divergirem. Substitui/complementa o
// teste existente em ticker-fallback.test.ts (bloco "paridade do denylist"),
// que só congelava tokens individuais do denylist e NÃO teria detectado as 3
// divergências reais do achado F18 (PLAYER_STOP_TOKENS ausente no motor,
// escapeRegex não exportada no motor, separador de dedup espaço vs NUL byte)
// corrigidas no item 002 (commit 9f9dfd5).
//
// Prova de que este teste detecta o drift de F18 (aceite do item 003,
// critério 40 — "Teste que só passa não serve; a prova de que detecta o
// drift de F18 é parte do aceite."): o segundo describe abaixo reidrata
// literalmente o bloco compartilhado do motor ANTES do item 002 (capturado
// via `git show 9f9dfd5~1:motor/src/news/ticker-fallback.ts`, extraído a
// partir de `export const AMBIGUITY_DENYLIST`) como fixture de regressão e
// mostra que o hash diverge do core atual — ou seja, este teste TERIA
// falhado no estado pré-002. O hash literal também está documentado no corpo
// do commit 9f9dfd5 e registrado em PROGRESS.md deste loop.
// ============================================================================

import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'

const SHARED_BLOCK_MARKER = 'export const AMBIGUITY_DENYLIST'

/** Extrai o bloco compartilhado (do marcador até o fim do arquivo) e retorna o hash SHA-256 hex. */
function hashSharedBlock(source: string): string {
  const idx = source.indexOf(SHARED_BLOCK_MARKER)
  if (idx === -1) {
    throw new Error(`marcador "${SHARED_BLOCK_MARKER}" não encontrado no arquivo`)
  }
  const block = source.slice(idx)
  return createHash('sha256').update(block, 'utf8').digest('hex')
}

const CORE_PATH = join(__dirname, '../../../../footstock-next/src/lib/utils/ticker-resolver-core.ts')
const MIRROR_PATH = join(__dirname, '../ticker-fallback.ts')

describe('ticker parity — hash do bloco compartilhado (F18, item 003)', () => {
  it('bloco compartilhado do motor tem hash idêntico ao core do Next (estado atual, pós-002)', () => {
    const coreHash = hashSharedBlock(readFileSync(CORE_PATH, 'utf8'))
    const mirrorHash = hashSharedBlock(readFileSync(MIRROR_PATH, 'utf8'))
    expect(mirrorHash).toBe(coreHash)
  })
})

// Fixture literal do bloco compartilhado do motor ANTES do item 002 (commit
// pai 1b34d51a12931c5f6ab1e5f0fd711d180670b339; arquivo obtido via
// `git show 9f9dfd5~1:motor/src/news/ticker-fallback.ts`, linhas 16-93).
// Reproduzida byte-a-byte (via JSON.stringify do conteúdo lido do git) para
// não depender de `git` disponível no runner de teste.
const PRE_002_MIRROR_BLOCK =
  "export const AMBIGUITY_DENYLIST: ReadonlySet<string> = new Set([\n  // dicionário / substantivos comuns\n  'vitoria', 'coxa', 'celeste', 'glorioso', 'soberano', 'majestoso', 'nacao',\n  'fiel', 'papo', 'indio', 'pantera', 'fantasma', 'colorado',\n  // sobrenomes / nomes comuns\n  'santos', 'coelho',\n  // gentílicos / adjetivos regionais\n  'americano', 'americas', 'mineiro', 'paranaense', 'pernambucano', 'cearense',\n  'cearenses', 'goianienses', 'santistas', 'cruzeirenses', 'palmeirenses',\n  'corinthianos', 'bahianos', 'cuiabanos', 'coritibanos', 'avaiano', 'alagoano',\n  // locais / regiões\n  'goiania', 'campinas', 'florianopolis', 'pantanal', 'capibaribe',\n  // siglas / abreviações genéricas e formas ambíguas internacionais\n  'abc', 'flu', 'inter', 'sport', 'athletic', 'baenao', 'azulino', 'pajucara',\n])\n\nexport function normalize(s: string): string {\n  return (s ?? '').toLowerCase().normalize('NFD').replace(/\\p{Diacritic}/gu, '')\n}\n\nfunction escapeRegex(s: string): string {\n  return s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')\n}\n\nexport type AliasIndex = Array<[alias: string, ticker: string]>\n\nexport function buildAliasIndex(\n  entries: Array<{ ticker: string; searchText: string | null | undefined }>,\n): AliasIndex {\n  const aliasToTickers = new Map<string, Set<string>>()\n  const raw: AliasIndex = []\n  for (const { ticker, searchText } of entries) {\n    if (!searchText) continue\n    for (const part of searchText.split(/[,;|]+/)) {\n      const alias = normalize(part.trim())\n      if (alias.length <= 2) continue\n      if (AMBIGUITY_DENYLIST.has(alias)) continue\n      raw.push([alias, ticker])\n      let set = aliasToTickers.get(alias)\n      if (!set) { set = new Set(); aliasToTickers.set(alias, set) }\n      set.add(ticker)\n    }\n  }\n  const seen = new Set<string>()\n  const index: AliasIndex = []\n  for (const [alias, ticker] of raw) {\n    if ((aliasToTickers.get(alias)?.size ?? 0) > 1) continue\n    const key = `${alias} ${ticker}`\n    if (seen.has(key)) continue\n    seen.add(key)\n    index.push([alias, ticker])\n  }\n  index.sort((a, b) => b[0].length - a[0].length)\n  return index\n}\n\nexport function resolveFromIndex(\n  text: string,\n  index: AliasIndex,\n): { ticker: string; alias: string } | null {\n  if (!text?.trim()) return null\n  const norm = normalize(text)\n  let best: { ticker: string; alias: string; pos: number } | null = null\n  for (const [alias, ticker] of index) {\n    const re = new RegExp(`(?<![a-z0-9])${escapeRegex(alias)}(?![a-z0-9])`)\n    const m = re.exec(norm)\n    if (!m) continue\n    const pos = m.index\n    if (\n      best === null ||\n      pos < best.pos ||\n      (pos === best.pos && alias.length > best.alias.length)\n    ) {\n      best = { ticker, alias, pos }\n    }\n  }\n  return best ? { ticker: best.ticker, alias: best.alias } : null\n}\n"

// Hash conhecido do bloco PRE-002 do motor, documentado no corpo do commit
// 9f9dfd5 ("mirror=6f206b5179...b11e43") e registrado em PROGRESS.md do
// item 002 deste loop.
const PRE_002_MIRROR_HASH_KNOWN = '6f206b5179864fc81bb452598efae0e79c233844b78ce52b80247a12f4b11e43'

describe('ticker parity — regressão (prova de que o teste falha antes da correção)', () => {
  it('hash do bloco PRE-002 do motor diverge do hash atual do core (drift de F18 detectado)', () => {
    const coreHash = hashSharedBlock(readFileSync(CORE_PATH, 'utf8'))
    const preFixHash = hashSharedBlock(PRE_002_MIRROR_BLOCK)
    expect(preFixHash).not.toBe(coreHash)
  })

  it('hash do bloco PRE-002 do motor bate com o valor documentado no commit 9f9dfd5', () => {
    const preFixHash = hashSharedBlock(PRE_002_MIRROR_BLOCK)
    expect(preFixHash).toBe(PRE_002_MIRROR_HASH_KNOWN)
  })
})
