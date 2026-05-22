// ============================================================================
// CLUBS_PUBLIC — Lista publica dos 40 clubes (SEM realName).
//
// Importavel por client components — nao vaza a associacao ficticio<->real.
// Para uso server-side com realName, importar de './clubs' (server-only).
//
// Fonte da verdade do mapping ticker -> realName fica em './clubs' e no banco
// (tabela assets, coluna real_name). Esta lista existe apenas para alimentar
// dropdowns admin e a constante tickers.ts sem expor real_name no bundle JS.
// ============================================================================

export interface PublicClub {
  ticker: string
  /** Nome ficticio exibido na plataforma apos cadastro */
  displayName: string
  division: 'SERIE_A' | 'SERIE_B'
}

export const CLUBS_PUBLIC: PublicClub[] = [
  // Serie A (20 clubes)
  { ticker: 'URU3', displayName: 'Urubu da Gavea FC',                division: 'SERIE_A' },
  { ticker: 'POR4', displayName: 'Porco do Parque FC',               division: 'SERIE_A' },
  { ticker: 'TIM3', displayName: 'Timão do São Jorge FC',            division: 'SERIE_A' },
  { ticker: 'TRI4', displayName: 'Tricolor do Morumbi AC',           division: 'SERIE_A' },
  { ticker: 'GAL3', displayName: 'Galo da Lagoinha FC',              division: 'SERIE_A' },
  { ticker: 'IMO3', displayName: 'Imortal da Arena FC',              division: 'SERIE_A' },
  { ticker: 'COL3', displayName: 'Colorado do Beira-Rio SC',         division: 'SERIE_A' },
  { ticker: 'GUE4', displayName: 'Guerreiro das Laranjeiras AC',     division: 'SERIE_A' },
  { ticker: 'BAL4', displayName: 'Baleia da Vila Belmiro SC',        division: 'SERIE_A' },
  { ticker: 'MAL4', displayName: 'Cruz de Malta de São Januário SC', division: 'SERIE_A' },
  { ticker: 'FOG3', displayName: 'Estrela do General Severiano RC',  division: 'SERIE_A' },
  { ticker: 'FUR3', displayName: 'Furacão do Capão da Imbuia FC',    division: 'SERIE_A' },
  { ticker: 'FOR3', displayName: 'Leão do Pici FC',                  division: 'SERIE_A' },
  { ticker: 'TRI3', displayName: 'Tricolor da Fonte Nova FC',        division: 'SERIE_A' },
  { ticker: 'RAP3', displayName: 'Raposa do Mineirão FC',            division: 'SERIE_A' },
  { ticker: 'RBB3', displayName: 'Touro do Nabi FC',                 division: 'SERIE_A' },
  { ticker: 'CUI3', displayName: 'Dourado do Pantanal FC',           division: 'SERIE_A' },
  { ticker: 'VIT3', displayName: 'Leão da Barra FC',                 division: 'SERIE_A' },
  { ticker: 'JUV3', displayName: 'Índio da Serra Gaúcha FC',         division: 'SERIE_A' },
  { ticker: 'MIR3', displayName: 'Leãozinho do Maiô FC',             division: 'SERIE_A' },
  // Serie B (20 clubes)
  { ticker: 'LEI3', displayName: 'Leão da Ilha do Retiro FC',        division: 'SERIE_B' },
  { ticker: 'NTL3', displayName: 'Tigre do Vale do Peixe FC',        division: 'SERIE_B' },
  { ticker: 'AVA3', displayName: 'Leão da Ilha SC',                  division: 'SERIE_B' },
  { ticker: 'GOI3', displayName: 'Periquito da Serrinha FC',         division: 'SERIE_B' },
  { ticker: 'CHA3', displayName: 'Condá da Arena Verde FC',          division: 'SERIE_B' },
  { ticker: 'PON3', displayName: 'Macaca do Majestoso FC',           division: 'SERIE_B' },
  { ticker: 'GUA3', displayName: 'Bugre do Brinco de Ouro FC',       division: 'SERIE_B' },
  { ticker: 'OPE3', displayName: 'Fantasma dos Campos Gerais FC',    division: 'SERIE_B' },
  { ticker: 'SAM3', displayName: 'Labirinto da Ilha do Amor FC',     division: 'SERIE_B' },
  { ticker: 'TIS3', displayName: 'Tigre da Serra Dourada FC',        division: 'SERIE_B' },
  { ticker: 'LON3', displayName: 'Tubarão do Café FC',               division: 'SERIE_B' },
  { ticker: 'FIG3', displayName: 'Alvinegro da Ressacada FC',        division: 'SERIE_B' },
  { ticker: 'PAY3', displayName: 'Papão da Curuzu FC',               division: 'SERIE_B' },
  { ticker: 'CFC3', displayName: 'Vovó Alemão do Couto FC',          division: 'SERIE_B' },
  { ticker: 'AME3', displayName: 'Coelho do Calafate FC',            division: 'SERIE_B' },
  { ticker: 'BSA3', displayName: 'Pantera da Mogiana FC',            division: 'SERIE_B' },
  { ticker: 'CRB3', displayName: 'Galo da Pajuçara RC',              division: 'SERIE_B' },
  { ticker: 'CSA3', displayName: 'Jacaré do Mutange FC',             division: 'SERIE_B' },
  { ticker: 'ITA3', displayName: 'Galo de Itu FC',                   division: 'SERIE_B' },
  { ticker: 'TON3', displayName: 'Gavião do Tombos FC',              division: 'SERIE_B' },
]
