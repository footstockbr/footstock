// ============================================================================
// FootStock — resolveTickerFromText (wrapper server-only)
// Mapeia nomes reais de times → ticker. A lógica de matching pura vive em
// ./ticker-resolver-core.ts (reutilizada por motor + scripts de backfill).
//
// SEGURANÇA: 'server-only' garante que os aliases de times reais NUNCA cheguem
// ao bundle do cliente. Nomes reais de clubes são dados sensíveis do produto.
//
// HARDENING (2026-06-23, precisão-acima-de-recall):
// - Núcleo compartilhado em ticker-resolver-core.ts:
//     * AMBIGUITY_DENYLIST (tokens-bare = palavras comuns / sobrenomes / locais)
//     * auto-suppressão de aliases em colisão (alias → >1 ticker)
//     * resolução por posição-mais-à-esquerda (favorece o time-sujeito do título)
// - CANONICAL_TEAM_ALIASES RE-SINCRONIZADO ao DB real (eliminado o drift que
//   mapeava DRA3→Goiás quando o DB diz DRA3=Atlético Goianiense).
// Histórico anterior (2026-05-24): word-boundary, NFD, ticker-drift fixes.
// ============================================================================

import 'server-only'

import { prisma } from '@/lib/prisma'
import {
  normalize,
  escapeRegex,
  buildAliasIndex,
  resolveFromIndex,
  AMBIGUITY_DENYLIST,
  PLAYER_STOP_TOKENS,
} from './ticker-resolver-core'

// Re-export para consumidores existentes (testes, callers).
export { normalize }

// ---------------------------------------------------------------------------
// Tickers ativos (40) — deve estar em sincronia com assets.is_active no DB.
// ---------------------------------------------------------------------------
export const ACTIVE_TICKERS = new Set([
  'ABT3', 'PEI3', 'CAV3', 'COE3', 'COL3', 'CON3', 'CBA3', 'DRA3',
  'FAS3', 'REG3', 'FUR3', 'GAL3', 'GAP3', 'GUE3', 'IMO3', 'IND3',
  'RMO3', 'LEA3', 'LEI3', 'LDI3', 'LEM3', 'LEP3', 'MAC3', 'CRZ3',
  'NAF3', 'PAN3', 'PER3', 'POR3', 'RAP3', 'TIG3', 'TIM3', 'TIS3',
  'TIV3', 'TOR3', 'BMP3', 'TRI3', 'TUB3', 'URU3', 'COX3', 'VOZ3',
])

// ---------------------------------------------------------------------------
// Aliases canônicos por ticker — fallback hardcoded quando o DB está indisponível.
// GERADO a partir do search_text real do DB (2026-06-23) aplicando o MESMO
// denylist + auto-suppressão de colisões do core, garantindo paridade com o
// Passo 1 (DB) e ZERO drift. Aliases ambíguos ('tricolor','leao','tigre',
// 'athletic club') foram descartados na geração por colidirem entre tickers.
// ---------------------------------------------------------------------------
export const CANONICAL_TEAM_ALIASES: Record<string, string[]> = {
  ABT3: ['ec sao bernardo', 'sao bernardo', 'tigre do grande abc', 'abc paulista', 'sao bernardo fc', 'grande abc'],
  BMP3: ['bahia', 'tricolor baiano', 'esquadrao de aco', 'bahia fc', 'esporte clube bahia'],
  CAV3: ['athletic mg', 'sao joao del rei', 'esquadrao de tiradentes'],
  CBA3: ['cuiaba', 'dourado', 'cuiaba ec', 'cuiaba futebol clube', 'dourado do pantanal'],
  COE3: ['america-mg', 'america mineiro', 'coelho do calafate', 'america mg'],
  COL3: ['internacional', 'inter de porto alegre', 'scr internacional', 'colorado gaucho'],
  CON3: ['chapecoense', 'chape', 'verdao do oeste', 'chapecoense sc', 'chapeco', 'chapecoense futebol'],
  COX3: ['coritiba', 'coxa-branca', 'coritiba fc', 'couto pereira', 'alviverde paranaense'],
  CRZ3: ['vasco da gama', 'vasco', 'cruzmaltino', 'cruz-maltino', 'vasco rj', 'sao januario', 'gigante da colina', 'vasco de sa'],
  DRA3: ['atletico goianiense', 'atletico-go', 'atletico go', 'dragao', 'rubro-negro goiano', 'cerradao'],
  FAS3: ['operario-pr', 'operario', 'operario ferroviario', 'operario esporte clube'],
  FUR3: ['athletico-pr', 'athletico paranaense', 'furacao', 'cap', 'atletico paranaense', 'athletico curitibano'],
  GAL3: ['atletico-mg', 'atletico mineiro', 'galo', 'alvinegro', 'galao', 'atletico bh', 'galo doido'],
  GAP3: ['crb', 'clube de regatas brasil', 'galo da pajucara', 'crb maceio'],
  GUE3: ['fluminense', 'tricolor carioca', 'guerreiro', 'lanceiro', 'pos-flu', 'fluminense fc', 'das laranjeiras'],
  IMO3: ['gremio', 'imortal', 'tricolor gaucho', 'gremio fbpa', 'gremio porto alegre', 'gremio footbal'],
  IND3: ['juventude', 'juventude caxias', 'ec juventude', 'juventude rs', 'caxias do sul'],
  LDI3: ['avai', 'leao da ilha sc', 'avai fc', 'avai futebol clube'],
  LEA3: ['leao da barra', 'vitoria ba', 'ecvitoria', 'rubro-negro baiano', 'vitoria salvador'],
  LEI3: ['sport recife', 'leao da ilha', 'sport club do recife', 'sport club'],
  LEM3: ['mirassol', 'leaozinho', 'mirassol fc', 'mirassolenses', 'leao do interior'],
  LEP3: ['fortaleza', 'leao do pici', 'tricolor cearense', 'fortaleza ec', 'fortaleza ce'],
  MAC3: ['ponte preta', 'macaca', 'ponte preta aa', 'aaponte', 'macaquinhos'],
  NAF3: ['nautico', 'timbu', 'clube nautico capibaribe', 'nautico recife', 'timbu pernambucano'],
  PAN3: ['botafogo-sp', 'botafogo sao paulo', 'botafogo ribeirao preto', 'botafogo sp', 'pantera da mogiana'],
  PEI3: ['peixe', 'alvinegro praiano', 'santos fc', 'vila belmiro', 'meninos da vila'],
  PER3: ['goias', 'periquito', 'esporte clube goias', 'goias ec', 'verdao do cerrado'],
  POR3: ['palmeiras', 'alviverde', 'porco', 'palestra italia', 'sociedade esportiva palmeiras', 'verdao'],
  RAP3: ['cruzeiro', 'raposa', 'cruzeiro mg', 'cruzeiro esporte clube', 'cabuloso'],
  REG3: ['botafogo', 'fogao', 'estrela solitaria', 'manequinho', 'botafogo rj', 'botafogo de futebol e regatas'],
  RMO3: ['remo', 'clube do remo', 'leao azul', 'remo para'],
  TIG3: ['criciuma', 'criciuma ec', 'carvoeiro', 'tigre do heriberto', 'criciuma esporte clube'],
  TIM3: ['corinthians', 'timao', 'sao jorge', 'sccp', 'sport club corinthians', 'timozao'],
  TIS3: ['vila nova', 'coloradinho', 'vila nova fc', 'vila nova go'],
  TIV3: ['novorizontino', 'novorizontino fc', 'novo horizonte', 'tigrinho do vale do peixe'],
  TOR3: ['rb bragantino', 'bragantino', 'touro da mogiana', 'red bull bragantino', 'massa bruta', 'braganca paulista'],
  TRI3: ['sao paulo', 'spfc', 'tricolor paulista', 'sao paulo fc', 'morumbi', 'sao paulo futebol clube'],
  TUB3: ['londrina', 'tubarao', 'londrina ec', 'londrinenses', 'tubarao do cafe', 'lec'],
  URU3: ['flamengo', 'mengao', 'urubu', 'rubro-negro', 'crf', 'clube de regatas flamengo', 'flamenguistas'],
  VOZ3: ['ceara', 'vozao', 'ceara sc', 'ceara sporting club', 'ceara futebol', 'vozao ce'],
}

// Índice canônico (Passo 2) construído uma vez no load do módulo.
const CANONICAL_INDEX = buildAliasIndex(
  Object.entries(CANONICAL_TEAM_ALIASES).map(([ticker, aliases]) => ({
    ticker,
    searchText: aliases.join(', '),
  })),
)

function buildMatchTokens(raw: string | null | undefined, splitBy: RegExp): string[] {
  if (!raw) return []
  const tokens = new Set<string>()
  for (const piece of raw.split(splitBy)) {
    const normalized = normalize(piece.trim())
    if (normalized.length < 4) continue
    if (PLAYER_STOP_TOKENS.has(normalized)) continue
    if (AMBIGUITY_DENYLIST.has(normalized)) continue
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
 * Resolve um ticker a partir de texto livre (idealmente o TÍTULO da notícia).
 *
 * Estratégia de 3 passos (todos via core hardened: denylist + colisão + posição):
 * 1. DB searchText (isActive assets) — prioridade; dados sempre atualizados
 * 2. CANONICAL_TEAM_ALIASES (hardcoded) — fallback DB-down, sem drift
 * 3. Asset.players + Asset.coachName — camada de nomes individuais
 *
 * Retorna null quando nenhum alias bate (notícia sem clube identificável) — o
 * que é o resultado CORRETO para notícias de seleção/exterior/Copa do Mundo.
 * Server-side ONLY.
 */
export async function resolveTickerFromText(text: string): Promise<string | null> {
  if (!text?.trim()) return null

  // ─── Passo 1: DB searchText ──────────────────────────────────────────────
  try {
    const assets = await prisma.asset.findMany({
      select: { ticker: true, searchText: true },
      where: { isActive: true },
    })
    const dbIndex = buildAliasIndex(assets)
    const hit = resolveFromIndex(text, dbIndex)
    if (hit) return hit.ticker
  } catch {
    // DB indisponível: fallback para Passo 2
  }

  // ─── Passo 2: CANONICAL_TEAM_ALIASES (offline, sem drift) ─────────────────
  const canonHit = resolveFromIndex(text, CANONICAL_INDEX)
  if (canonHit && ACTIVE_TICKERS.has(canonHit.ticker)) return canonHit.ticker

  // ─── Passo 3: Jogadores + técnico ───────────────────────────────────────
  return await resolveByPlayersAndCoach(text)
}

/**
 * Alias semântico: resolve a partir do TÍTULO da notícia. Mesma implementação
 * de resolveTickerFromText (que já favorece a posição mais à esquerda), exposto
 * com nome explícito para os call-sites de fallback (publish, motor, backfill).
 */
export async function resolveTickerFromTitle(title: string): Promise<string | null> {
  return resolveTickerFromText(title)
}

/**
 * Retorna o searchText padrão para um ticker (aliases canônicos separados por vírgula).
 */
export function getDefaultSearchText(ticker: string): string {
  return CANONICAL_TEAM_ALIASES[ticker]?.join(', ') ?? ''
}

/**
 * Valida se um ticker é ativo no sistema.
 */
export function isActiveTicker(ticker: string): boolean {
  return ACTIVE_TICKERS.has(ticker.toUpperCase())
}
