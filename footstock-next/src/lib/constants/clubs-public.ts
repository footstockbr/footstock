// ============================================================================
// CLUBS_PUBLIC — Lista publica dos 40 clubes (SEM realName).
//
// Importavel por client components — nao vaza a associacao ficticio<->real.
// Para uso server-side com realName, importar de './clubs' (server-only).
//
// Fonte da verdade: tabela `assets` (banco), alinhada a Precificacao IPO 2026.
// Gerado a partir do banco de producao; tickers conforme tabela canonica do IPO.
// ============================================================================

export interface PublicClub {
  ticker: string
  /** Nome ficticio exibido na plataforma apos cadastro */
  displayName: string
  division: 'SERIE_A' | 'SERIE_B'
}

export const CLUBS_PUBLIC: PublicClub[] = [
  // Serie A (20 clubes)
  { ticker: 'URU3', displayName: 'Urubu da Gavea FC', division: 'SERIE_A' },
  { ticker: 'POR3', displayName: 'Porco do Parque FC', division: 'SERIE_A' },
  { ticker: 'TIM3', displayName: 'Timao do Sao Jorge FC', division: 'SERIE_A' },
  { ticker: 'TRI3', displayName: 'Tricolor do Morumbi AC', division: 'SERIE_A' },
  { ticker: 'GUE3', displayName: 'Guerreiro das Laranjeiras AC', division: 'SERIE_A' },
  { ticker: 'GAL3', displayName: 'Galo da Lagoinha FC', division: 'SERIE_A' },
  { ticker: 'REG3', displayName: 'Estrela do General Severiano RC', division: 'SERIE_A' },
  { ticker: 'COL3', displayName: 'Colorado do Beira-Rio SC', division: 'SERIE_A' },
  { ticker: 'TOR3', displayName: 'Touro do Nabi FC', division: 'SERIE_A' },
  { ticker: 'FUR3', displayName: 'Furacao do Capao da Imbuia FC', division: 'SERIE_A' },
  { ticker: 'IMO3', displayName: 'Imortal da Arena FC', division: 'SERIE_A' },
  { ticker: 'PEI3', displayName: 'Baleia da Vila Belmiro SC', division: 'SERIE_A' },
  { ticker: 'CRZ3', displayName: 'Cruz de Malta de Sao Januario SC', division: 'SERIE_A' },
  { ticker: 'RAP3', displayName: 'Raposa do Mineirao FC', division: 'SERIE_A' },
  { ticker: 'BMP3', displayName: 'Tricolor da Fonte Nova FC', division: 'SERIE_A' },
  { ticker: 'LEA3', displayName: 'Leao da Barra FC', division: 'SERIE_A' },
  { ticker: 'COX3', displayName: 'Vovo Alemao do Couto FC', division: 'SERIE_A' },
  { ticker: 'LEM3', displayName: 'Leaozinho do Maiao FC', division: 'SERIE_A' },
  { ticker: 'CON3', displayName: 'Conda da Arena Verde FC', division: 'SERIE_A' },
  { ticker: 'RMO3', displayName: 'Leao Azul do Baenao RC', division: 'SERIE_A' },
  // Serie B (20 clubes)
  { ticker: 'LEP3', displayName: 'Leao do Pici FC', division: 'SERIE_B' },
  { ticker: 'CBA3', displayName: 'Dourado do Pantanal FC', division: 'SERIE_B' },
  { ticker: 'VOZ3', displayName: 'Vovo do Castelao FC', division: 'SERIE_B' },
  { ticker: 'TIG3', displayName: 'Tigre do Heriberto FC', division: 'SERIE_B' },
  { ticker: 'LEI3', displayName: 'Leao da Ilha do Retiro FC', division: 'SERIE_B' },
  { ticker: 'IND3', displayName: 'Indio da Serra Gaucha FC', division: 'SERIE_B' },
  { ticker: 'COE3', displayName: 'Coelho do Calafate FC', division: 'SERIE_B' },
  { ticker: 'DRA3', displayName: 'Dragao do Cerradao FC', division: 'SERIE_B' },
  { ticker: 'LDI3', displayName: 'Leao da Ilha SC', division: 'SERIE_B' },
  { ticker: 'TIV3', displayName: 'Tigre do Vale do Peixe FC', division: 'SERIE_B' },
  { ticker: 'GAP3', displayName: 'Galo da Pajucara RC', division: 'SERIE_B' },
  { ticker: 'TIS3', displayName: 'Tigre da Serra Dourada FC', division: 'SERIE_B' },
  { ticker: 'PAN3', displayName: 'Pantera da Mogiana FC', division: 'SERIE_B' },
  { ticker: 'PER3', displayName: 'Periquito da Serrinha FC', division: 'SERIE_B' },
  { ticker: 'FAS3', displayName: 'Fantasma dos Campos Gerais FC', division: 'SERIE_B' },
  { ticker: 'NAF3', displayName: 'Timbu dos Aflitos FC', division: 'SERIE_B' },
  { ticker: 'MAC3', displayName: 'Macaca do Majestoso FC', division: 'SERIE_B' },
  { ticker: 'TUB3', displayName: 'Tubarao do Cafe FC', division: 'SERIE_B' },
  { ticker: 'CAV3', displayName: 'Cavalo de Tiradentes FC', division: 'SERIE_B' },
  { ticker: 'ABT3', displayName: 'Tigre do Grande ABC FC', division: 'SERIE_B' },
]
