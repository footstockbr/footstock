// ============================================================================
// CLUBS — Lista completa dos 40 clubes COM realName (server-only).
//
// IMPORTANTE: modulo server-only. Importar em Client Component quebra o build.
// Para Client Components, importar de './clubs-public' (sem realName).
//
// realName conforme a tabela canonica de Precificacao IPO 2026 (clube real por
// ticker). Em runtime a fonte da verdade do realName e o banco (assets.real_name).
// ============================================================================

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
  POR3: 'Palmeiras',
  TIM3: 'Corinthians',
  TRI3: 'São Paulo',
  GUE3: 'Fluminense',
  GAL3: 'Atlético-MG',
  REG3: 'Botafogo',
  COL3: 'Internacional',
  TOR3: 'RB Bragantino',
  FUR3: 'Athletico-PR',
  IMO3: 'Grêmio',
  PEI3: 'Santos',
  CRZ3: 'Vasco da Gama',
  RAP3: 'Cruzeiro',
  BMP3: 'Bahia',
  LEA3: 'Vitória',
  COX3: 'Coritiba',
  LEM3: 'Mirassol',
  CON3: 'Chapecoense',
  RMO3: 'Remo',
  // Serie B
  LEP3: 'Fortaleza',
  CBA3: 'Cuiabá',
  VOZ3: 'Ceará',
  TIG3: 'Criciúma',
  LEI3: 'Sport Recife',
  IND3: 'Juventude',
  COE3: 'América-MG',
  DRA3: 'Atlético Goianiense',
  LDI3: 'Avaí',
  TIV3: 'Novorizontino',
  GAP3: 'CRB',
  TIS3: 'Vila Nova',
  PAN3: 'Botafogo-SP',
  PER3: 'Goiás',
  FAS3: 'Operário-PR',
  NAF3: 'Náutico',
  MAC3: 'Ponte Preta',
  TUB3: 'Londrina',
  CAV3: 'Athletic Club',
  ABT3: 'São Bernardo',
}

/** 40 clubes do futebol brasileiro (Série A + B), com realName server-only. */
export const CLUBS: ClubOption[] = CLUBS_PUBLIC.map((club) => ({
  ...club,
  realName: REAL_NAMES[club.ticker] ?? club.displayName,
}))

/** Mapeamento ticker -> cores primaria/secundaria (seed e UI). */
export const CLUB_COLORS: Record<string, { primary: string; secondary: string }> = {
  URU3: { primary: '#e21d1d', secondary: '#1a1a1a' }, // Flamengo
  POR3: { primary: '#006432', secondary: '#ffffff' }, // Palmeiras
  TIM3: { primary: '#1a1a1a', secondary: '#ffffff' }, // Corinthians
  TRI3: { primary: '#cc0000', secondary: '#1a1a1a' }, // São Paulo
  GUE3: { primary: '#8b0000', secondary: '#16a34a' }, // Fluminense
  GAL3: { primary: '#1a1a1a', secondary: '#ffffff' }, // Atlético-MG
  REG3: { primary: '#1a1a1a', secondary: '#ffffff' }, // Botafogo
  COL3: { primary: '#cc0000', secondary: '#ffffff' }, // Internacional
  TOR3: { primary: '#e21d1d', secondary: '#ffffff' }, // RB Bragantino
  FUR3: { primary: '#cc0000', secondary: '#1a1a1a' }, // Athletico-PR
  IMO3: { primary: '#0b56a5', secondary: '#f59e0b' }, // Grêmio
  PEI3: { primary: '#1a1a1a', secondary: '#ffffff' }, // Santos
  CRZ3: { primary: '#1a1a1a', secondary: '#ffffff' }, // Vasco da Gama
  RAP3: { primary: '#003fa3', secondary: '#ffffff' }, // Cruzeiro
  BMP3: { primary: '#003fa3', secondary: '#cc0000' }, // Bahia
  LEA3: { primary: '#cc0000', secondary: '#1a1a1a' }, // Vitória
  COX3: { primary: '#006432', secondary: '#ffffff' }, // Coritiba
  LEM3: { primary: '#f59e0b', secondary: '#003fa3' }, // Mirassol
  CON3: { primary: '#006432', secondary: '#ffffff' }, // Chapecoense
  RMO3: { primary: '#003fa3', secondary: '#ffffff' }, // Remo
  LEP3: { primary: '#cc0000', secondary: '#003fa3' }, // Fortaleza
  CBA3: { primary: '#f59e0b', secondary: '#006432' }, // Cuiabá
  VOZ3: { primary: '#1a1a1a', secondary: '#ffffff' }, // Ceará
  TIG3: { primary: '#003fa3', secondary: '#ffffff' }, // Criciúma
  LEI3: { primary: '#cc0000', secondary: '#1a1a1a' }, // Sport Recife
  IND3: { primary: '#16a34a', secondary: '#ffffff' }, // Juventude
  COE3: { primary: '#006432', secondary: '#ffffff' }, // América-MG
  DRA3: { primary: '#e65c00', secondary: '#1a1a1a' }, // Atlético Goianiense
  LDI3: { primary: '#003fa3', secondary: '#ffffff' }, // Avaí
  TIV3: { primary: '#1a1a1a', secondary: '#f59e0b' }, // Novorizontino
  GAP3: { primary: '#003fa3', secondary: '#cc0000' }, // CRB
  TIS3: { primary: '#cc0000', secondary: '#1a1a1a' }, // Vila Nova
  PAN3: { primary: '#1a1a1a', secondary: '#f59e0b' }, // Botafogo-SP
  PER3: { primary: '#16a34a', secondary: '#ffffff' }, // Goiás
  FAS3: { primary: '#1a1a1a', secondary: '#ffffff' }, // Operário-PR
  NAF3: { primary: '#cc0000', secondary: '#ffffff' }, // Náutico
  MAC3: { primary: '#1a1a1a', secondary: '#ffffff' }, // Ponte Preta
  TUB3: { primary: '#16a34a', secondary: '#ffffff' }, // Londrina
  CAV3: { primary: '#003fa3', secondary: '#ffffff' }, // Athletic Club
  ABT3: { primary: '#1a1a1a', secondary: '#f59e0b' }, // São Bernardo
}

/** Mapeamento ticker -> displayName (nome ficticio usado na plataforma). */
export const CLUB_DISPLAY_NAMES: Record<string, string> = {
  URU3: 'Urubu da Gavea FC',
  POR3: 'Porco do Parque FC',
  TIM3: 'Timao do Sao Jorge FC',
  TRI3: 'Tricolor do Morumbi AC',
  GUE3: 'Guerreiro das Laranjeiras AC',
  GAL3: 'Galo da Lagoinha FC',
  REG3: 'Estrela do General Severiano RC',
  COL3: 'Colorado do Beira-Rio SC',
  TOR3: 'Touro do Nabi FC',
  FUR3: 'Furacao do Capao da Imbuia FC',
  IMO3: 'Imortal da Arena FC',
  PEI3: 'Baleia da Vila Belmiro SC',
  CRZ3: 'Cruz de Malta de Sao Januario SC',
  RAP3: 'Raposa do Mineirao FC',
  BMP3: 'Tricolor da Fonte Nova FC',
  LEA3: 'Leao da Barra FC',
  COX3: 'Vovo Alemao do Couto FC',
  LEM3: 'Leaozinho do Maiao FC',
  CON3: 'Conda da Arena Verde FC',
  RMO3: 'Leao Azul do Baenao RC',
  LEP3: 'Leao do Pici FC',
  CBA3: 'Dourado do Pantanal FC',
  VOZ3: 'Vovo do Castelao FC',
  TIG3: 'Tigre do Heriberto FC',
  LEI3: 'Leao da Ilha do Retiro FC',
  IND3: 'Indio da Serra Gaucha FC',
  COE3: 'Coelho do Calafate FC',
  DRA3: 'Dragao do Cerradao FC',
  LDI3: 'Leao da Ilha SC',
  TIV3: 'Tigre do Vale do Peixe FC',
  GAP3: 'Galo da Pajucara RC',
  TIS3: 'Tigre da Serra Dourada FC',
  PAN3: 'Pantera da Mogiana FC',
  PER3: 'Periquito da Serrinha FC',
  FAS3: 'Fantasma dos Campos Gerais FC',
  NAF3: 'Timbu dos Aflitos FC',
  MAC3: 'Macaca do Majestoso FC',
  TUB3: 'Tubarao do Cafe FC',
  CAV3: 'Cavalo de Tiradentes FC',
  ABT3: 'Tigre do Grande ABC FC',
}
