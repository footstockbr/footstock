// ============================================================================
// Foot Stock — resolveTickerFromText
// Utilitário server-side APENAS para mapear nomes reais de times → ticker.
//
// SEGURANÇA: Este arquivo usa 'server-only' para garantir que os aliases de
// times reais NUNCA cheguem ao bundle do cliente.
// Os nomes reais dos clubes são dados sensíveis de identidade do produto.
// ============================================================================

import 'server-only'

import { prisma } from '@/lib/prisma'

// ---------------------------------------------------------------------------
// Aliases canônicos por ticker (fallback quando searchText do DB está vazio)
// Cada array: [nome_principal, variações, siglas, apelidos...]
// Chave: ticker canônico do ativo
// ---------------------------------------------------------------------------

export const CANONICAL_TEAM_ALIASES: Record<string, string[]> = {
  // Série A
  URU3: ['flamengo', 'fla', 'fla3', 'fla4', 'flm3', 'urubu', 'rubro-negro', 'rubro negro', 'cr flamengo'],
  POR4: ['palmeiras', 'pal', 'pal3', 'pal4', 'verdão', 'verdao', 'porco', 'se palmeiras'],
  TIM3: ['corinthians', 'cori', 'cori3', 'cori4', 'timão', 'timao', 'coringão', 'coringao', 'sport club corinthians'],
  TRI4: ['são paulo', 'sao paulo', 'spfc', 'spfc3', 'sao paulo fc', 'tricolor paulista'],
  GAL3: ['atlético-mg', 'atletico-mg', 'atletico mg', 'atlético mineiro', 'atletico mineiro', 'galo', 'cam', 'galo mineiro'],
  IMO3: ['grêmio', 'gremio', 'gre3', 'gre4', 'tricolor gaúcho', 'tricolor gaucho', 'grêmio fbpa', 'imortal'],
  COL3: ['internacional', 'inter', 'inter3', 'inter4', 'colorado', 'sport club internacional'],
  GUE4: ['fluminense', 'flu', 'flu3', 'flu4', 'tricolor carioca', 'fluminense fc'],
  BAL4: ['santos', 'san3', 'san4', 'peixe', 'santos fc', 'santos futebol clube'],
  MAL4: ['vasco', 'vas3', 'vas4', 'vasco da gama', 'cruz-maltino', 'crvg', 'cruz maltino'],
  FOG3: ['botafogo', 'bot3', 'bot4', 'bota', 'fogão', 'fogao', 'estrela solitária', 'estrela solitaria', 'botafogo fr'],
  FUR3: ['athletico-pr', 'athletico', 'cap', 'furacão', 'furacao', 'clube athletico paranaense', 'athletico paranaense'],
  FOR3: ['fortaleza', 'fort3', 'leão do pici', 'leao do pici', 'fortaleza ec', 'tricolor do pici'],
  TRI3: ['bahia', 'bah3', 'tricolor baiano', 'esporte clube bahia', 'ec bahia'],
  RAP3: ['cruzeiro', 'cru3', 'cru4', 'raposa', 'cec', 'cruzeiro esporte clube'],
  RBB3: ['bragantino', 'brg3', 'rb bragantino', 'red bull bragantino', 'massa bruta', 'novorizontino bragantino'],
  CUI3: ['cuiabá', 'cuiaba', 'cui3', 'cuiabá ec', 'cuiaba ec', 'dourado'],
  VIT3: ['vitória', 'vitoria', 'vit3', 'leão da barra', 'leao da barra', 'ec vitória', 'ec vitoria'],
  JUV3: ['juventude', 'juv3', 'índio', 'indio', 'ec juventude', 'caxias juventude'],
  MIR3: ['mirassol', 'mir3', 'leãozinho', 'leaozinho', 'mirassol fc'],
  // Série B
  LEI3: ['sport', 'sport recife', 'lei3', 'leão da ilha', 'leao da ilha', 'sport club do recife'],
  NTL3: ['novorizontino', 'ntl3', 'tigre novorizontino', 'grêmio novorizontino', 'gremio novorizontino'],
  AVA3: ['avaí', 'avai', 'ava3', 'avaí fc', 'avai fc'],
  GOI3: ['goiás', 'goias', 'goi3', 'esmeraldino', 'goiás ec', 'goias ec'],
  CHA3: ['chapecoense', 'chape', 'cha3', 'condá', 'conda', 'associação chapecoense'],
  PON3: ['ponte preta', 'pon3', 'macaca', 'aa ponte preta', 'associação atlética ponte preta'],
  GUA3: ['guarani', 'gua3', 'bugre', 'guarani fc', 'guarani campinas'],
  OPE3: ['operário', 'operario', 'ope3', 'operário-pr', 'operario-pr', 'operário ferroviário', 'operario ferroviario'],
  SAM3: ['sampaio corrêa', 'sampaio correa', 'sam3', 'sampaio', 'sampaio corrêa fc'],
  TIS3: ['vila nova', 'tis3', 'vila nova fc', 'tigre da serra'],
  LON3: ['londrina', 'lon3', 'tubarão', 'tubarao', 'londrina ec'],
  FIG3: ['figueirense', 'fig3', 'figueira', 'figueirense fc'],
  PAY3: ['paysandu', 'pay3', 'papão', 'papao', 'paysandu sc'],
  CFC3: ['coritiba', 'cfc3', 'couto', 'vovô', 'vovo', 'coritiba fbc'],
  AME3: ['america-mg', 'america mg', 'ame3', 'coelho', 'america mineiro', 'américas mineiro'],
  BSA3: ['botafogo-sp', 'botafogo sp', 'bsa3', 'pantera', 'botafogo ribeirão preto', 'botafogo ribeirao preto'],
  CRB3: ['crb', 'crb3', 'galo carijó', 'galo carijo', 'clube de regatas brasil'],
  CSA3: ['csa', 'csa3', 'centro sportivo alagoano', 'jacaré', 'jacare'],
  ITA3: ['itapirense', 'ita3', 'ituano', 'ituano fc', 'galo de itu'],
  TON3: ['tombense', 'ton3', 'gavião', 'gaviao', 'tombense fc'],
}

// Reverse flat map: alias.toLowerCase() → ticker
// Construído uma vez em módulo load (singleton por instância de servidor)
const ALIAS_TO_TICKER = new Map<string, string>()
for (const [ticker, aliases] of Object.entries(CANONICAL_TEAM_ALIASES)) {
  for (const alias of aliases) {
    ALIAS_TO_TICKER.set(alias.toLowerCase(), ticker)
  }
}

/**
 * Tenta resolver um ticker a partir de texto livre (título + conteúdo de notícia).
 *
 * Estratégia:
 * 1. Busca em Asset.searchText (DB) — prioridade: dados atualizados do admin
 * 2. Fallback para CANONICAL_TEAM_ALIASES (hardcoded) — segurança baseline
 *
 * Retorna o primeiro ticker encontrado ou null se nenhum alias bater.
 *
 * Server-side ONLY. Nunca chamar do lado do cliente.
 */
export async function resolveTickerFromText(text: string): Promise<string | null> {
  if (!text?.trim()) return null

  const lower = text.toLowerCase()

  // -------------------------------------------------------------------------
  // Passo 1: Buscar aliases no DB (searchText de cada ativo ativo)
  // -------------------------------------------------------------------------
  try {
    const assets = await prisma.asset.findMany({
      select: { ticker: true, searchText: true },
      where: { isActive: true, searchText: { not: '' } },
    })

    for (const asset of assets) {
      if (!asset.searchText) continue
      // searchText: vírgula ou ponto-e-vírgula ou pipe como separador
      const parts = asset.searchText
        .split(/[,;|]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 2) // ignora aliases muito curtos (ruído)

      for (const part of parts) {
        if (lower.includes(part)) return asset.ticker
      }
    }
  } catch {
    // DB indisponível: cair no fallback
  }

  // -------------------------------------------------------------------------
  // Passo 2: Fallback com mapa canônico hardcoded
  // Ordena por comprimento decrescente para preferir matches mais específicos
  // (ex: "atletico mineiro" bate antes de "atletico")
  // -------------------------------------------------------------------------
  const sortedAliases = Array.from(ALIAS_TO_TICKER.entries()).sort(
    (a, b) => b[0].length - a[0].length
  )

  for (const [alias, ticker] of sortedAliases) {
    if (alias.length > 2 && lower.includes(alias)) return ticker
  }

  return null
}

/**
 * Retorna o searchText padrão para um ticker (aliases canônicos separados por vírgula).
 * Usado como valor inicial no admin quando searchText do DB está vazio.
 */
export function getDefaultSearchText(ticker: string): string {
  return CANONICAL_TEAM_ALIASES[ticker]?.join(', ') ?? ''
}
