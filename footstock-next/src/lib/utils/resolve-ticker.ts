// ============================================================================
// FootStock — resolveTickerFromText
// Utilitário server-side APENAS para mapear nomes reais de times → ticker.
//
// SEGURANÇA: Este arquivo usa 'server-only' para garantir que os aliases de
// times reais NUNCA cheguem ao bundle do cliente.
// Os nomes reais dos clubes são dados sensíveis de identidade do produto.
//
// HARDENING (2026-05-24):
// - Word-boundary regex em todos os passos (elimina false positives como
//   'sport' em 'esportes', 'inter' em 'intercontinental')
// - Normalização de acentos consistente em texto e aliases
// - Sort por comprimento descendente antes de iterar (match mais específico)
// - CANONICAL_TEAM_ALIASES corrigido: tickers alinhados ao DB real
// - Aliases curtos/ambíguos removidos ou restritos a formas compostas
// ============================================================================

import 'server-only'

import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Tickers ativos (40) — deve estar em sincronia com assets.is_active no DB.
// Usado para validar saídas de LLM e para o fallback hardcoded.
// ---------------------------------------------------------------------------
export const ACTIVE_TICKERS = new Set([
  'ABT3', 'BAL3', 'CAV3', 'COE3', 'COL3', 'CON3', 'DOU3', 'DRA3',
  'FAS3', 'FOG3', 'FUR3', 'GAL3', 'GAP3', 'GUE3', 'IMO3', 'IND3',
  'LEA3', 'LEB3', 'LEI3', 'LDI3', 'LEM3', 'LEP3', 'MAC3', 'MAL3',
  'NAF3', 'PAN3', 'PER3', 'POR3', 'RAP3', 'TIG3', 'TIM3', 'TIS3',
  'TIV3', 'TOR3', 'TFN3', 'TRI3', 'TUB3', 'URU3', 'VOA3', 'VOZ3',
])

// ---------------------------------------------------------------------------
// Aliases canônicos por ticker — sincronizados com o DB real.
// Regras:
// - Ticker deve existir em ACTIVE_TICKERS e na tabela assets
// - Aliases curtos/ambíguos (<= 4 chars) removidos quando há colisão real
// - 'sport' removido (substring de 'esportes'); use 'sport recife'
// - 'inter' removido (colide com 'internacional'); use 'internacional'
// - 'flu' removido (presente em 'influência'); use 'fluminense'
// - 'bota' removido (verbo em pt-BR); use 'botafogo'
// - 'tricolor' ambíguo (São Paulo, Bahia, Grêmio); removido de todos
// - 'leao' ambíguo (Vitória, Sport, Paysandu, Fortaleza); removido standalone
// ---------------------------------------------------------------------------

export const CANONICAL_TEAM_ALIASES: Record<string, string[]> = {
  // ─── Série A ─────────────────────────────────────────────────────────────
  URU3: [
    'flamengo', 'fla', 'urubu', 'rubro-negro', 'rubro negro',
    'cr flamengo', 'flamenguistas', 'nacao rubro-negra',
  ],
  POR3: [
    'palmeiras', 'verdao', 'porco', 'se palmeiras',
    'alviverde', 'palmeirenses', 'palestra italia',
  ],
  TIM3: [
    'corinthians', 'timao', 'coringao', 'sport club corinthians',
    'timozao', 'fiel torcida', 'sccp',
  ],
  TRI3: [
    'sao paulo', 'spfc', 'sao paulo fc',
    'tricolor paulista', 'soberano', 'morumbi', 'morumbis',
  ],
  GAL3: [
    'atletico-mg', 'atletico mineiro', 'galo', 'atletico mg',
    'galo doido', 'atletico bh', 'cam',
  ],
  IMO3: [
    'gremio', 'imortal', 'tricolor gaucho',
    'gremio fbpa', 'gremio porto alegre', 'gremio footbal',
  ],
  COL3: [
    'internacional', 'colorado', 'inter de porto alegre',
    'scr internacional', 'colorado gaucho',
  ],
  GUE3: [
    'fluminense', 'fluminense fc', 'tricolor carioca',
    'das laranjeiras', 'guerreiro carioca',
  ],
  BAL3: [
    'santos', 'peixe', 'santos fc', 'meninos da vila',
    'alvinegro praiano', 'vila belmiro', 'santistas',
  ],
  MAL3: [
    'vasco', 'vasco da gama', 'cruzmaltino', 'cruz-maltino',
    'gigante da colina', 'sao januario', 'vasco rj',
  ],
  FOG3: [
    'botafogo', 'fogao', 'estrela solitaria', 'glorioso',
    'botafogo fr', 'botafogo rj', 'manequinho',
  ],
  FUR3: [
    'athletico-pr', 'athletico paranaense', 'furacao',
    'clube athletico paranaense', 'cap', 'athletico curitibano',
  ],
  TFN3: [
    'bahia', 'tricolor baiano', 'esquadrao de aco',
    'esporte clube bahia', 'ec bahia', 'bahianos',
  ],
  RAP3: [
    'cruzeiro', 'raposa', 'celeste', 'cruzeiro esporte clube',
    'cabuloso', 'cruzeirenses', 'cruzeiro mg',
  ],
  // ─── Série B e outros ────────────────────────────────────────────────────
  LEP3: [
    'fortaleza', 'leao do pici', 'fortaleza ec',
    'tricolor do pici', 'tricolor cearense', 'fortaleza ce',
  ],
  LEB3: [
    'vitoria', 'ec vitoria', 'leao da barra',
    'rubro-negro baiano', 'vitoria ba', 'vitoria salvador', 'ecvitoria',
  ],
  IND3: [
    'juventude', 'ec juventude', 'caxias juventude',
    'papo juventude', 'indio juventude', 'juventude rs',
  ],
  TOR3: [
    'bragantino', 'rb bragantino', 'red bull bragantino',
    'massa bruta', 'touro da mogiana', 'braganca paulista',
  ],
  DOU3: [
    'cuiaba', 'cuiaba ec', 'dourado do pantanal',
    'cuiabanos', 'pantanal cuiaba',
  ],
  LEM3: [
    'mirassol', 'mirassol fc', 'leao do interior',
    'leaozinho mirassol', 'mirassolenses',
  ],
  TIV3: [
    'novorizontino', 'novorizontino fc',
    'tigrinho do vale do peixe', 'novo horizonte',
  ],
  LDI3: [
    'avai', 'avai fc', 'leao da ilha sc',
    'avaiano', 'avai florianopolis',
  ],
  CON3: [
    'chapecoense', 'chape', 'chapecoense sc',
    'verdao do oeste', 'chapeco',
  ],
  MAC3: [
    'ponte preta', 'aa ponte preta', 'ponte preta aa',
    'macaquinhos', 'majestoso ponte',
  ],
  TUB3: [
    'londrina', 'londrina ec', 'tubarao do cafe', 'lec londrina',
  ],
  LEA3: [
    'paysandu', 'papao', 'paysandu sc', 'leao azul', 'paysan',
  ],
  VOA3: [
    'coritiba', 'coxa-branca', 'coritiba fc',
    'couto pereira', 'coritibanos', 'alviverde paranaense',
  ],
  COE3: [
    'america-mg', 'america mineiro', 'coelho',
    'america mg', 'coelho do calafate',
  ],
  PAN3: [
    'botafogo-sp', 'botafogo sp', 'pantera da mogiana',
    'botafogo ribeirao preto', 'botafogo ribeirão',
  ],
  GAP3: [
    'crb', 'clube de regatas brasil',
    'galo da pajucara', 'crb maceio',
  ],
  FAS3: [
    'operario', 'operario-pr', 'operario ferroviario',
    'fantasma operario', 'operario esporte clube',
  ],
  CAV3: [
    'tombense', 'tombense fc', 'cavalo de aco',
    'tombos', 'tombense mg',
  ],
  // ATENÇÃO: 'sport' removido — é substring de 'esportes' e causaria falso positivo
  // em toda notícia com "ESPN Esportes", "Jovem Pan Esportes" etc.
  // Usar obrigatoriamente as formas compostas 'sport recife', 'leao da ilha'.
  LEI3: [
    'sport recife', 'leao da ilha', 'sport club do recife',
    'sport pernambucano', 'sport club recife',
  ],
  VOZ3: [
    'ceara', 'vozao', 'ceara sc', 'ceara sporting club',
    'cearense', 'vozao ce',
  ],
  ABT3: [
    'sao bernardo', 'sao bernardo fc',
    'tigre do grande abc', 'ec sao bernardo',
  ],
  DRA3: [
    'goias', 'goias ec', 'esmeraldino',
    'esporte clube goias', 'goianienses',
  ],
  TIS3: [
    'vila nova', 'vila nova fc', 'tigre da serra',
    'coloradinho', 'vila nova go',
  ],
  NAF3: [
    'nautico', 'timbu', 'nautico recife',
    'clube nautico capibaribe', 'timbu pernambucano',
  ],
  TIG3: [
    'joinville', 'jec', 'joinville esporte clube',
    'joinvilenses', 'joinville sc',
  ],
}

// Reverse flat map: alias_normalizado → ticker
// Construído uma vez em módulo load (singleton por instância de servidor)
const ALIAS_TO_TICKER = new Map<string, string>()
for (const [ticker, aliases] of Object.entries(CANONICAL_TEAM_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_TICKER.set(normalize(alias), ticker)
  }
}

// ---------------------------------------------------------------------------
// Normalização: lowercase + strip acentos (NFD).
// Aplicada em texto e em aliases para garantir comparações consistentes.
// ---------------------------------------------------------------------------
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

// ---------------------------------------------------------------------------
// Word-boundary match: verifica se `alias` (já normalizado) aparece como
// palavra completa dentro de `normalizedText`.
// Usa lookbehind/lookahead negativo de [a-z0-9] em vez de \b puro porque
// após normalize() o texto é ASCII e \b funciona corretamente, mas a
// abordagem explícita é mais legível e verificável.
// ---------------------------------------------------------------------------
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesWordBoundary(normalizedText: string, normalizedAlias: string): boolean {
  const escaped = escapeRegex(normalizedAlias)
  // Negative lookbehind/lookahead para caractere alfanumérico:
  // impede que 'sport' case com 'esportes', 'inter' com 'intercontinental', etc.
  const re = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`)
  return re.test(normalizedText)
}

// Stop-tokens para camada de jogadores/técnicos.
const PLAYER_STOP_TOKENS = new Set([
  'da', 'do', 'de', 'dos', 'das', 'fc', 'jr', 'jnr', 'sr', 'neto', 'filho',
])

function buildMatchTokens(raw: string | null | undefined, splitBy: RegExp): string[] {
  if (!raw) return []
  const tokens = new Set<string>()
  for (const piece of raw.split(splitBy)) {
    const normalized = normalize(piece.trim())
    if (normalized.length < 4) continue
    if (PLAYER_STOP_TOKENS.has(normalized)) continue
    tokens.add(normalized)
  }
  return Array.from(tokens).sort((a, b) => b.length - a.length)
}

/**
 * Camada 3 de resolução: via Asset.players e Asset.coachName (word boundary).
 * Só é chamada quando as duas camadas anteriores não identificaram o time.
 */
export async function resolveByPlayersAndCoach(text: string): Promise<string | null> {
  if (!text?.trim()) return null
  const normText = normalize(text)

  try {
    const assets = await prisma.asset.findMany({
      select: { ticker: true, players: true, coachName: true },
      where: { isActive: true },
    })

    for (const asset of assets) {
      const playerTokens = buildMatchTokens(asset.players, /[,;|]+/)
      for (const token of playerTokens) {
        const re = new RegExp(`(?<![a-z0-9])${escapeRegex(token)}(?![a-z0-9])`)
        if (re.test(normText)) return asset.ticker
      }
      const coachTokens = buildMatchTokens(asset.coachName, /\s+/)
      for (const token of coachTokens) {
        const re = new RegExp(`(?<![a-z0-9])${escapeRegex(token)}(?![a-z0-9])`)
        if (re.test(normText)) return asset.ticker
      }
    }
  } catch {
    // DB indisponível: sem fallback possível nesta camada
  }

  return null
}

/**
 * Resolve um ticker a partir de texto livre (título + conteúdo de notícia).
 *
 * Estratégia de 3 passos:
 * 1. DB searchText (isActive assets) — prioridade; dados sempre atualizados
 * 2. CANONICAL_TEAM_ALIASES (hardcoded) — fallback seguro com tickers validados
 * 3. Asset.players + Asset.coachName — camada de nomes individuais
 *
 * Todos os passos usam:
 * - Normalização NFD (acentos stripped) em texto e aliases
 * - Word-boundary match (evita 'sport' → 'esportes', 'inter' → 'intercontinental')
 * - Sort por comprimento descendente (alias mais específico vence)
 *
 * Retorna null quando nenhum alias bate (notícia sem clube identificável).
 * Server-side ONLY.
 */
export async function resolveTickerFromText(text: string): Promise<string | null> {
  if (!text?.trim()) return null

  // Normalizar texto uma vez — usado em todos os passos
  const normText = normalize(text)

  // ─── Passo 1: DB searchText ──────────────────────────────────────────────
  try {
    const assets = await prisma.asset.findMany({
      select: { ticker: true, searchText: true },
      where: { isActive: true },
    })

    // Construir lista plana de (alias_normalizado, ticker) e ordenar por
    // comprimento descendente para que aliases mais específicos vençam.
    const dbAliases: Array<[string, string]> = []
    for (const asset of assets) {
      if (!asset.searchText) continue
      const parts = asset.searchText
        .split(/[,;|]+/)
        .map((s) => normalize(s.trim()))
        .filter((s) => s.length > 2)
      for (const part of parts) {
        dbAliases.push([part, asset.ticker])
      }
    }
    dbAliases.sort((a, b) => b[0].length - a[0].length)

    for (const [alias, ticker] of dbAliases) {
      if (matchesWordBoundary(normText, alias)) return ticker
    }
  } catch {
    // DB indisponível: fallback para Passo 2
  }

  // ─── Passo 2: CANONICAL_TEAM_ALIASES (tickers validados contra ACTIVE_TICKERS) ──
  // Sort por comprimento desc já feito na construção de ALIAS_TO_TICKER;
  // aqui reconstruímos ordenado para garantir consistência em runtime.
  const sortedAliases = Array.from(ALIAS_TO_TICKER.entries())
    .sort((a, b) => b[0].length - a[0].length)

  for (const [alias, ticker] of sortedAliases) {
    // Dupla verificação: alias longo e ticker existe no DB ativo
    if (alias.length > 2 && ACTIVE_TICKERS.has(ticker) && matchesWordBoundary(normText, alias)) {
      return ticker
    }
  }

  // ─── Passo 3: Jogadores + técnico ───────────────────────────────────────
  return await resolveByPlayersAndCoach(text)
}

/**
 * Retorna o searchText padrão para um ticker (aliases canônicos separados por vírgula).
 * Usado como valor inicial no admin quando searchText do DB está vazio.
 */
export function getDefaultSearchText(ticker: string): string {
  return CANONICAL_TEAM_ALIASES[ticker]?.join(', ') ?? ''
}

/**
 * Valida se um ticker é ativo no sistema.
 * Útil para validar saídas de LLM antes de persistir.
 */
export function isActiveTicker(ticker: string): boolean {
  return ACTIVE_TICKERS.has(ticker.toUpperCase())
}
