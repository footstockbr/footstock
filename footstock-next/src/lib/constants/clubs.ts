export interface ClubOption {
  ticker: string
  name: string
  division: 'SERIE_A' | 'SERIE_B'
}

/** 40 clubes do futebol brasileiro (Série A + B) */
export const CLUBS: ClubOption[] = [
  // Série A (20 clubes)
  { ticker: 'URU3', name: 'Urubu da Gavea FC', division: 'SERIE_A' },
  { ticker: 'POR4', name: 'Porco do Parque FC', division: 'SERIE_A' },
  { ticker: 'TIM3', name: 'Timão do São Jorge FC', division: 'SERIE_A' },
  { ticker: 'TRI4', name: 'Tricolor do Morumbi AC', division: 'SERIE_A' },
  { ticker: 'GAL3', name: 'Galo da Lagoinha FC', division: 'SERIE_A' },
  { ticker: 'IMO3', name: 'Imortal da Arena FC', division: 'SERIE_A' },
  { ticker: 'COL3', name: 'Colorado do Beira-Rio SC', division: 'SERIE_A' },
  { ticker: 'GUE4', name: 'Guerreiro das Laranjeiras AC', division: 'SERIE_A' },
  { ticker: 'BAL4', name: 'Baleia da Vila Belmiro SC', division: 'SERIE_A' },
  { ticker: 'MAL4', name: 'Cruz de Malta de São Januário SC', division: 'SERIE_A' },
  { ticker: 'FOG3', name: 'Estrela do General Severiano RC', division: 'SERIE_A' },
  { ticker: 'FUR3', name: 'Furacão do Capão da Imbuia FC', division: 'SERIE_A' },
  { ticker: 'FOR3', name: 'Leão do Pici FC', division: 'SERIE_A' },
  { ticker: 'TRI3', name: 'Tricolor da Fonte Nova FC', division: 'SERIE_A' },
  { ticker: 'RAP3', name: 'Raposa do Mineirão FC', division: 'SERIE_A' },
  { ticker: 'RBB3', name: 'Touro do Nabi FC', division: 'SERIE_A' },
  { ticker: 'CUI3', name: 'Dourado do Pantanal FC', division: 'SERIE_A' },
  { ticker: 'VIT3', name: 'Leão da Barra FC', division: 'SERIE_A' },
  { ticker: 'JUV3', name: 'Índio da Serra Gaúcha FC', division: 'SERIE_A' },
  { ticker: 'MIR3', name: 'Leãozinho do Maiô FC', division: 'SERIE_A' },
  // Série B (20 clubes)
  { ticker: 'LEI3', name: 'Leão da Ilha do Retiro FC', division: 'SERIE_B' },
  { ticker: 'NTL3', name: 'Tigre do Vale do Peixe FC', division: 'SERIE_B' },
  { ticker: 'AVA3', name: 'Leão da Ilha SC', division: 'SERIE_B' },
  { ticker: 'GOI3', name: 'Periquito da Serrinha FC', division: 'SERIE_B' },
  { ticker: 'CHA3', name: 'Condá da Arena Verde FC', division: 'SERIE_B' },
  { ticker: 'PON3', name: 'Macaca do Majestoso FC', division: 'SERIE_B' },
  { ticker: 'GUA3', name: 'Bugre do Brinco de Ouro FC', division: 'SERIE_B' },
  { ticker: 'OPE3', name: 'Fantasma dos Campos Gerais FC', division: 'SERIE_B' },
  { ticker: 'SAM3', name: 'Labirinto da Ilha do Amor FC', division: 'SERIE_B' },
  { ticker: 'TIS3', name: 'Tigre da Serra Dourada FC', division: 'SERIE_B' },
  { ticker: 'LON3', name: 'Tubarão do Café FC', division: 'SERIE_B' },
  { ticker: 'FIG3', name: 'Alvinegro da Ressacada FC', division: 'SERIE_B' },
  { ticker: 'PAY3', name: 'Papão da Curuzu FC', division: 'SERIE_B' },
  { ticker: 'CFC3', name: 'Vovó Alemão do Couto FC', division: 'SERIE_B' },
  { ticker: 'AME3', name: 'Coelho do Calafate FC', division: 'SERIE_B' },
  { ticker: 'BSA3', name: 'Pantera da Mogiana FC', division: 'SERIE_B' },
  { ticker: 'CRB3', name: 'Galo da Pajuçara RC', division: 'SERIE_B' },
  { ticker: 'CSA3', name: 'Jacaré do Mutange FC', division: 'SERIE_B' },
  { ticker: 'ITA3', name: 'Galo de Itu FC', division: 'SERIE_B' },
  { ticker: 'TON3', name: 'Gavião do Tombos FC', division: 'SERIE_B' },
]

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
