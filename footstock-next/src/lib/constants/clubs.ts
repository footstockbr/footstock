// ============================================================================
// CLUBS — Lista completa dos 40 clubes COM realName (server-only).
//
// IMPORTANTE: este modulo e server-only via `import 'server-only'`. Importar
// daqui em qualquer Client Component fara o build do Next.js falhar — exato
// comportamento desejado para evitar vazar a associacao ticker<->clube real
// no bundle JS publico.
//
// Para uso em Client Components, importar de './clubs-public' (sem realName).
//
// Em runtime, a fonte da verdade do realName e o banco (tabela `assets`,
// coluna `real_name`, populada via migration M056). Esta constante existe
// como bootstrap/seed snapshot e fallback de derivacao no register API.
// ============================================================================

// Guardrail server-only manual. Equivalente a `import 'server-only'` mas
// compativel com Node puro (Prisma seed via tsx) onde o pacote `server-only`
// lança incondicionalmente sem o resolver custom do Next.js.
if (typeof window !== 'undefined') {
  throw new Error(
    "[clubs.ts] modulo server-only — importe de '@/lib/constants/clubs-public' em Client Components."
  )
}

import { CLUBS_PUBLIC, type PublicClub } from './clubs-public'

export interface ClubOption extends PublicClub {
  /** Nome real do clube — server-only. NUNCA expor em endpoints publicos exceto /clubs-for-selection. */
  realName: string
}

const REAL_NAMES: Record<string, string> = {
  // Serie A
  URU3: 'Flamengo',
  POR4: 'Palmeiras',
  TIM3: 'Corinthians',
  TRI4: 'São Paulo',
  GAL3: 'Atlético-MG',
  IMO3: 'Grêmio',
  COL3: 'Internacional',
  GUE4: 'Fluminense',
  BAL4: 'Santos',
  MAL4: 'Vasco da Gama',
  FOG3: 'Botafogo',
  FUR3: 'Athletico-PR',
  FOR3: 'Fortaleza',
  TRI3: 'Bahia',
  RAP3: 'Cruzeiro',
  RBB3: 'RB Bragantino',
  CUI3: 'Cuiabá',
  VIT3: 'Vitória',
  JUV3: 'Juventude',
  MIR3: 'Mirassol',
  // Serie B
  LEI3: 'Sport Recife',
  NTL3: 'Novorizontino',
  AVA3: 'Avaí',
  GOI3: 'Goiás',
  CHA3: 'Chapecoense',
  PON3: 'Ponte Preta',
  GUA3: 'Guarani',
  OPE3: 'Operário-PR',
  SAM3: 'Sampaio Corrêa',
  TIS3: 'Vila Nova',
  LON3: 'Londrina',
  FIG3: 'Figueirense',
  PAY3: 'Paysandu',
  CFC3: 'Coritiba',
  AME3: 'América-MG',
  BSA3: 'Botafogo-SP',
  CRB3: 'CRB',
  CSA3: 'CSA',
  ITA3: 'Ituano',
  TON3: 'Tombense',
}

/** 40 clubes do futebol brasileiro (Série A + B), com realName server-only. */
export const CLUBS: ClubOption[] = CLUBS_PUBLIC.map((c) => ({
  ...c,
  realName: REAL_NAMES[c.ticker] ?? c.displayName,
}))

/**
 * Mapeamento ticker -> cores primaria/secundaria para uso no seed e UI.
 * Cores escolhidas com base na identidade visual aproximada dos clubes reais.
 */
export const CLUB_COLORS: Record<string, { primary: string; secondary: string }> = {
  // Série A
  URU3: { primary: '#C8102E', secondary: '#000000' }, // Flamengo
  POR4: { primary: '#006F3C', secondary: '#FFFFFF' }, // Palmeiras
  TIM3: { primary: '#000000', secondary: '#FFFFFF' }, // Corinthians
  TRI4: { primary: '#CC0000', secondary: '#000000' }, // São Paulo
  GAL3: { primary: '#000000', secondary: '#FFFFFF' }, // Atletico-MG
  IMO3: { primary: '#023778', secondary: '#FFFFFF' }, // Grêmio
  COL3: { primary: '#D00000', secondary: '#FFFFFF' }, // Internacional
  GUE4: { primary: '#6D2038', secondary: '#339933' }, // Fluminense
  BAL4: { primary: '#FFFFFF', secondary: '#000000' }, // Santos
  MAL4: { primary: '#000000', secondary: '#FFFFFF' }, // Vasco
  FOG3: { primary: '#000000', secondary: '#FFFFFF' }, // Botafogo
  FUR3: { primary: '#CC0000', secondary: '#000000' }, // Athletico-PR
  FOR3: { primary: '#002366', secondary: '#CC0000' }, // Fortaleza
  TRI3: { primary: '#1B368A', secondary: '#CC0000' }, // Bahia
  RAP3: { primary: '#0033A0', secondary: '#FFFFFF' }, // Cruzeiro
  RBB3: { primary: '#FFFFFF', secondary: '#CC0000' }, // RB Bragantino
  CUI3: { primary: '#DAA520', secondary: '#1A237E' }, // Cuiabá
  VIT3: { primary: '#CC0000', secondary: '#000000' }, // Vitória
  JUV3: { primary: '#006400', secondary: '#FFFFFF' }, // Juventude
  MIR3: { primary: '#FFD700', secondary: '#000080' }, // Mirassol
  // Série B
  LEI3: { primary: '#CC0000', secondary: '#000000' }, // Sport Recife
  NTL3: { primary: '#CC6600', secondary: '#FFFFFF' }, // Novorizontino
  AVA3: { primary: '#003399', secondary: '#000000' }, // Avaí
  GOI3: { primary: '#006400', secondary: '#FFFFFF' }, // Goiás
  CHA3: { primary: '#006400', secondary: '#FFFFFF' }, // Chapecoense
  PON3: { primary: '#000000', secondary: '#FFFFFF' }, // Ponte Preta
  GUA3: { primary: '#006400', secondary: '#FFFFFF' }, // Guarani
  OPE3: { primary: '#000000', secondary: '#FFFFFF' }, // Operário-PR
  SAM3: { primary: '#CC0000', secondary: '#000000' }, // Sampaio Corrêa
  TIS3: { primary: '#CC6600', secondary: '#FFFFFF' }, // Vila Nova
  LON3: { primary: '#CC0000', secondary: '#FFFFFF' }, // Londrina
  FIG3: { primary: '#000000', secondary: '#FFFFFF' }, // Figueirense
  PAY3: { primary: '#003399', secondary: '#FFFFFF' }, // Paysandu
  CFC3: { primary: '#006400', secondary: '#FFFFFF' }, // Coritiba
  AME3: { primary: '#006400', secondary: '#FFFFFF' }, // América-MG
  BSA3: { primary: '#000000', secondary: '#FFFFFF' }, // Botafogo-SP
  CRB3: { primary: '#CC0000', secondary: '#000000' }, // CRB
  CSA3: { primary: '#000099', secondary: '#FFFFFF' }, // CSA
  ITA3: { primary: '#CC0000', secondary: '#000000' }, // Ituano
  TON3: { primary: '#1A1A2E', secondary: '#FFFFFF' }, // Tombense
}

/**
 * Mapeamento ticker -> displayName (nome ficticio usado na plataforma após cadastro).
 * O nome real do clube e exibido APENAS na tela de seleção do cadastro.
 */
export const CLUB_DISPLAY_NAMES: Record<string, string> = {
  URU3: 'Urubu da Gavea FC',
  POR4: 'Porco do Parque FC',
  TIM3: 'Timão do São Jorge FC',
  TRI4: 'Tricolor do Morumbi AC',
  GAL3: 'Galo da Lagoinha FC',
  IMO3: 'Imortal da Arena FC',
  COL3: 'Colorado do Beira-Rio SC',
  GUE4: 'Guerreiro das Laranjeiras AC',
  BAL4: 'Baleia da Vila Belmiro SC',
  MAL4: 'Cruz de Malta de São Januário SC',
  FOG3: 'Estrela do General Severiano RC',
  FUR3: 'Furacão do Capão da Imbuia FC',
  FOR3: 'Leão do Pici',
  TRI3: 'Tricolor da Fonte Nova FC',
  RAP3: 'Raposa do Mineirão FC',
  RBB3: 'Toro Loco',
  CUI3: 'Dourado do Cerrado',
  VIT3: 'Leão da Barra',
  JUV3: 'Papo da Serra',
  MIR3: 'Leão do Interior',
}
