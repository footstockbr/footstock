export interface ClubOption {
  ticker: string
  /** Nome fictício exibido na plataforma após cadastro */
  displayName: string
  /** Nome real do clube — exibido APENAS no step 3 de cadastro para ajudar identificação */
  realName: string
  division: 'SERIE_A' | 'SERIE_B'
}

/** 40 clubes do futebol brasileiro (Série A + B) */
export const CLUBS: ClubOption[] = [
  // Série A (20 clubes)
  { ticker: 'URU3', displayName: 'Urubu da Gavea FC',               realName: 'Flamengo',        division: 'SERIE_A' },
  { ticker: 'POR4', displayName: 'Porco do Parque FC',              realName: 'Palmeiras',       division: 'SERIE_A' },
  { ticker: 'TIM3', displayName: 'Timão do São Jorge FC',           realName: 'Corinthians',     division: 'SERIE_A' },
  { ticker: 'TRI4', displayName: 'Tricolor do Morumbi AC',          realName: 'São Paulo',       division: 'SERIE_A' },
  { ticker: 'GAL3', displayName: 'Galo da Lagoinha FC',             realName: 'Atlético-MG',     division: 'SERIE_A' },
  { ticker: 'IMO3', displayName: 'Imortal da Arena FC',             realName: 'Grêmio',          division: 'SERIE_A' },
  { ticker: 'COL3', displayName: 'Colorado do Beira-Rio SC',        realName: 'Internacional',   division: 'SERIE_A' },
  { ticker: 'GUE4', displayName: 'Guerreiro das Laranjeiras AC',    realName: 'Fluminense',      division: 'SERIE_A' },
  { ticker: 'BAL4', displayName: 'Baleia da Vila Belmiro SC',       realName: 'Santos',          division: 'SERIE_A' },
  { ticker: 'MAL4', displayName: 'Cruz de Malta de São Januário SC',realName: 'Vasco da Gama',   division: 'SERIE_A' },
  { ticker: 'FOG3', displayName: 'Estrela do General Severiano RC', realName: 'Botafogo',        division: 'SERIE_A' },
  { ticker: 'FUR3', displayName: 'Furacão do Capão da Imbuia FC',   realName: 'Athletico-PR',    division: 'SERIE_A' },
  { ticker: 'FOR3', displayName: 'Leão do Pici FC',                 realName: 'Fortaleza',       division: 'SERIE_A' },
  { ticker: 'TRI3', displayName: 'Tricolor da Fonte Nova FC',       realName: 'Bahia',           division: 'SERIE_A' },
  { ticker: 'RAP3', displayName: 'Raposa do Mineirão FC',           realName: 'Cruzeiro',        division: 'SERIE_A' },
  { ticker: 'RBB3', displayName: 'Touro do Nabi FC',                realName: 'RB Bragantino',   division: 'SERIE_A' },
  { ticker: 'CUI3', displayName: 'Dourado do Pantanal FC',          realName: 'Cuiabá',          division: 'SERIE_A' },
  { ticker: 'VIT3', displayName: 'Leão da Barra FC',                realName: 'Vitória',         division: 'SERIE_A' },
  { ticker: 'JUV3', displayName: 'Índio da Serra Gaúcha FC',        realName: 'Juventude',       division: 'SERIE_A' },
  { ticker: 'MIR3', displayName: 'Leãozinho do Maiô FC',            realName: 'Mirassol',        division: 'SERIE_A' },
  // Série B (20 clubes)
  { ticker: 'LEI3', displayName: 'Leão da Ilha do Retiro FC',       realName: 'Sport Recife',    division: 'SERIE_B' },
  { ticker: 'NTL3', displayName: 'Tigre do Vale do Peixe FC',       realName: 'Novorizontino',   division: 'SERIE_B' },
  { ticker: 'AVA3', displayName: 'Leão da Ilha SC',                 realName: 'Avaí',            division: 'SERIE_B' },
  { ticker: 'GOI3', displayName: 'Periquito da Serrinha FC',        realName: 'Goiás',           division: 'SERIE_B' },
  { ticker: 'CHA3', displayName: 'Condá da Arena Verde FC',         realName: 'Chapecoense',     division: 'SERIE_B' },
  { ticker: 'PON3', displayName: 'Macaca do Majestoso FC',          realName: 'Ponte Preta',     division: 'SERIE_B' },
  { ticker: 'GUA3', displayName: 'Bugre do Brinco de Ouro FC',      realName: 'Guarani',         division: 'SERIE_B' },
  { ticker: 'OPE3', displayName: 'Fantasma dos Campos Gerais FC',   realName: 'Operário-PR',     division: 'SERIE_B' },
  { ticker: 'SAM3', displayName: 'Labirinto da Ilha do Amor FC',    realName: 'Sampaio Corrêa',  division: 'SERIE_B' },
  { ticker: 'TIS3', displayName: 'Tigre da Serra Dourada FC',       realName: 'Vila Nova',       division: 'SERIE_B' },
  { ticker: 'LON3', displayName: 'Tubarão do Café FC',              realName: 'Londrina',        division: 'SERIE_B' },
  { ticker: 'FIG3', displayName: 'Alvinegro da Ressacada FC',       realName: 'Figueirense',     division: 'SERIE_B' },
  { ticker: 'PAY3', displayName: 'Papão da Curuzu FC',              realName: 'Paysandu',        division: 'SERIE_B' },
  { ticker: 'CFC3', displayName: 'Vovó Alemão do Couto FC',         realName: 'Coritiba',        division: 'SERIE_B' },
  { ticker: 'AME3', displayName: 'Coelho do Calafate FC',           realName: 'América-MG',      division: 'SERIE_B' },
  { ticker: 'BSA3', displayName: 'Pantera da Mogiana FC',           realName: 'Botafogo-SP',     division: 'SERIE_B' },
  { ticker: 'CRB3', displayName: 'Galo da Pajuçara RC',             realName: 'CRB',             division: 'SERIE_B' },
  { ticker: 'CSA3', displayName: 'Jacaré do Mutange FC',            realName: 'CSA',             division: 'SERIE_B' },
  { ticker: 'ITA3', displayName: 'Galo de Itu FC',                  realName: 'Ituano',          division: 'SERIE_B' },
  { ticker: 'TON3', displayName: 'Gavião do Tombos FC',             realName: 'Tombense',        division: 'SERIE_B' },
]

/**
 * Mapeamento ticker → cores primaria/secundaria para uso no seed e UI.
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
 * Mapeamento ticker → displayName (nome fictício usado na plataforma após cadastro).
 * O nome real do clube é exibido APENAS na tela de seleção do cadastro.
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
