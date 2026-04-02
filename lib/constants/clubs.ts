export interface ClubOption {
  ticker: string
  name: string
  division: 'SERIE_A' | 'SERIE_B'
}

/**
 * Cores primária e secundária por clube (INTAKE).
 * Secundária usada em gráficos de comparação para evitar colisão de cores.
 * Regra de resolução: 1º clube = primária, 2º = secundária, 3º = primária@40%, 4º = secundária@40%.
 */
export const CLUB_COLORS: Record<string, { primary: string; secondary: string }> = {
  // Série A
  URU3: { primary: '#e21d1d', secondary: '#1a1a1a' },  // Vermelho/Preto
  POR4: { primary: '#006432', secondary: '#ffffff' },   // Verde/Branco
  TIM3: { primary: '#1a1a1a', secondary: '#ffffff' },   // Preto/Branco
  TRI4: { primary: '#cc0000', secondary: '#1a1a1a' },   // Vermelho/Preto
  GAL3: { primary: '#1a1a1a', secondary: '#ffffff' },   // Preto/Branco
  FOG3: { primary: '#1a1a1a', secondary: '#ffffff' },   // Preto/Branco
  COL3: { primary: '#cc0000', secondary: '#ffffff' },   // Vermelho/Branco
  IMO3: { primary: '#0b56a5', secondary: '#f59e0b' },   // Azul/Dourado
  RAP3: { primary: '#003fa3', secondary: '#ffffff' },   // Azul Royal/Branco
  MAL4: { primary: '#1a1a1a', secondary: '#ffffff' },   // Preto/Branco
  TRI3: { primary: '#003fa3', secondary: '#cc0000' },   // Azul/Vermelho
  GUE4: { primary: '#8b0000', secondary: '#16a34a' },   // Grená/Verde
  TOR3: { primary: '#e21d1d', secondary: '#ffffff' },   // Vermelho/Branco
  LEM3: { primary: '#f59e0b', secondary: '#003fa3' },   // Amarelo/Azul
  BAL4: { primary: '#1a1a1a', secondary: '#ffffff' },   // Preto/Branco
  FUR3: { primary: '#cc0000', secondary: '#1a1a1a' },   // Vermelho/Preto
  VOA4: { primary: '#006432', secondary: '#ffffff' },   // Verde/Branco
  CON3: { primary: '#006432', secondary: '#ffffff' },   // Verde/Branco
  LEA3: { primary: '#003fa3', secondary: '#ffffff' },   // Azul/Branco
  LEB3: { primary: '#cc0000', secondary: '#1a1a1a' },   // Vermelho/Preto

  // Série B
  COE3: { primary: '#006432', secondary: '#ffffff' },   // Verde/Branco
  CAV4: { primary: '#003fa3', secondary: '#ffffff' },   // Azul/Branco
  DRA3: { primary: '#e65c00', secondary: '#1a1a1a' },   // Laranja/Preto
  LEI4: { primary: '#003fa3', secondary: '#ffffff' },   // Azul/Branco
  PAN3: { primary: '#1a1a1a', secondary: '#f59e0b' },   // Preto/Dourado
  VOZ3: { primary: '#1a1a1a', secondary: '#ffffff' },   // Preto/Branco
  GAP3: { primary: '#003fa3', secondary: '#cc0000' },   // Azul/Vermelho
  TIG4: { primary: '#003fa3', secondary: '#ffffff' },   // Azul/Branco
  DOU4: { primary: '#f59e0b', secondary: '#006432' },   // Dourado/Verde
  LEP4: { primary: '#cc0000', secondary: '#003fa3' },   // Vermelho/Azul
  PER3: { primary: '#16a34a', secondary: '#ffffff' },   // Verde/Branco
  IND4: { primary: '#16a34a', secondary: '#ffffff' },   // Verde/Branco
  TUB3: { primary: '#16a34a', secondary: '#ffffff' },   // Verde/Branco
  NAF3: { primary: '#cc0000', secondary: '#ffffff' },   // Vermelho/Branco
  TIV3: { primary: '#1a1a1a', secondary: '#f59e0b' },   // Preto/Amarelo
  FAS3: { primary: '#1a1a1a', secondary: '#ffffff' },   // Preto/Branco
  MAC4: { primary: '#1a1a1a', secondary: '#ffffff' },   // Preto/Branco
  ABT4: { primary: '#1a1a1a', secondary: '#f59e0b' },   // Preto/Dourado
  LEI3: { primary: '#cc0000', secondary: '#1a1a1a' },   // Vermelho/Preto
  TIS3: { primary: '#cc0000', secondary: '#1a1a1a' },   // Vermelho/Preto
}

/**
 * Fonte única dos nomes fictícios dos clubes (INTAKE).
 * Use este enum sempre que precisar referenciar nomes de clubes no domínio.
 */
export enum SerieAClubFictionalName {
  URU3 = 'Urubu da Gavea FC',
  POR4 = 'Porco do Parque FC',
  TIM3 = 'Timao do Sao Jorge FC',
  TRI4 = 'Tricolor do Morumbi AC',
  GAL3 = 'Galo da Lagoinha FC',
  FOG3 = 'Estrela do General Severiano RC',
  COL3 = 'Colorado do Beira-Rio SC',
  IMO3 = 'Imortal da Arena FC',
  RAP3 = 'Raposa do Mineirao FC',
  MAL4 = 'Cruz de Malta de Sao Januario SC',
  TRI3 = 'Tricolor da Fonte Nova FC',
  GUE4 = 'Guerreiro das Laranjeiras AC',
  TOR3 = 'Touro do Nabi FC',
  LEM3 = 'Leaozinho do Maiao FC',
  BAL4 = 'Baleia da Vila Belmiro SC',
  FUR3 = 'Furacao do Capao da Imbuia FC',
  VOA4 = 'Vovo Alemao do Couto FC',
  CON3 = 'Conda da Arena Verde FC',
  LEA3 = 'Leao Azul do Baenao RC',
  LEB3 = 'Leao da Barra FC',
}

export enum SerieBClubFictionalName {
  COE3 = 'Coelho do Calafate FC',
  CAV4 = 'Cavalo de Tiradentes FC',
  DRA3 = 'Dragao do Cerradao FC',
  LEI4 = 'Leao da Ilha SC',
  PAN3 = 'Pantera da Mogiana FC',
  VOZ3 = 'Vovo do Castelao FC',
  GAP3 = 'Galo da Pajucara RC',
  TIG4 = 'Tigre do Heriberto FC',
  DOU4 = 'Dourado do Pantanal FC',
  LEP4 = 'Leao do Pici FC',
  PER3 = 'Periquito da Serrinha FC',
  IND4 = 'Indio da Serra Gaucha FC',
  TUB3 = 'Tubarao do Cafe FC',
  NAF3 = 'Timbu dos Aflitos FC',
  TIV3 = 'Tigre do Vale do Peixe FC',
  FAS3 = 'Fantasma dos Campos Gerais FC',
  MAC4 = 'Macaca do Majestoso FC',
  ABT4 = 'Tigre do Grande ABC FC',
  LEI3 = 'Leao da Ilha do Retiro FC',
  TIS3 = 'Tigre da Serra Dourada FC',
}

export type ClubFictionalName = SerieAClubFictionalName | SerieBClubFictionalName

/**
 * Lista canonica de 40 ativos do INTAKE (nomes ficticios + tickers ficticios).
 */
export const CLUBS: ClubOption[] = [
  // Serie A (20)
  { ticker: 'URU3', name: SerieAClubFictionalName.URU3, division: 'SERIE_A' },
  { ticker: 'POR4', name: SerieAClubFictionalName.POR4, division: 'SERIE_A' },
  { ticker: 'TIM3', name: SerieAClubFictionalName.TIM3, division: 'SERIE_A' },
  { ticker: 'TRI4', name: SerieAClubFictionalName.TRI4, division: 'SERIE_A' },
  { ticker: 'GAL3', name: SerieAClubFictionalName.GAL3, division: 'SERIE_A' },
  { ticker: 'FOG3', name: SerieAClubFictionalName.FOG3, division: 'SERIE_A' },
  { ticker: 'COL3', name: SerieAClubFictionalName.COL3, division: 'SERIE_A' },
  { ticker: 'IMO3', name: SerieAClubFictionalName.IMO3, division: 'SERIE_A' },
  { ticker: 'RAP3', name: SerieAClubFictionalName.RAP3, division: 'SERIE_A' },
  { ticker: 'MAL4', name: SerieAClubFictionalName.MAL4, division: 'SERIE_A' },
  { ticker: 'TRI3', name: SerieAClubFictionalName.TRI3, division: 'SERIE_A' },
  { ticker: 'GUE4', name: SerieAClubFictionalName.GUE4, division: 'SERIE_A' },
  { ticker: 'TOR3', name: SerieAClubFictionalName.TOR3, division: 'SERIE_A' },
  { ticker: 'LEM3', name: SerieAClubFictionalName.LEM3, division: 'SERIE_A' },
  { ticker: 'BAL4', name: SerieAClubFictionalName.BAL4, division: 'SERIE_A' },
  { ticker: 'FUR3', name: SerieAClubFictionalName.FUR3, division: 'SERIE_A' },
  { ticker: 'VOA4', name: SerieAClubFictionalName.VOA4, division: 'SERIE_A' },
  { ticker: 'CON3', name: SerieAClubFictionalName.CON3, division: 'SERIE_A' },
  { ticker: 'LEA3', name: SerieAClubFictionalName.LEA3, division: 'SERIE_A' },
  { ticker: 'LEB3', name: SerieAClubFictionalName.LEB3, division: 'SERIE_A' },

  // Serie B (20)
  { ticker: 'COE3', name: SerieBClubFictionalName.COE3, division: 'SERIE_B' },
  { ticker: 'CAV4', name: SerieBClubFictionalName.CAV4, division: 'SERIE_B' },
  { ticker: 'DRA3', name: SerieBClubFictionalName.DRA3, division: 'SERIE_B' },
  { ticker: 'LEI4', name: SerieBClubFictionalName.LEI4, division: 'SERIE_B' },
  { ticker: 'PAN3', name: SerieBClubFictionalName.PAN3, division: 'SERIE_B' },
  { ticker: 'VOZ3', name: SerieBClubFictionalName.VOZ3, division: 'SERIE_B' },
  { ticker: 'GAP3', name: SerieBClubFictionalName.GAP3, division: 'SERIE_B' },
  { ticker: 'TIG4', name: SerieBClubFictionalName.TIG4, division: 'SERIE_B' },
  { ticker: 'DOU4', name: SerieBClubFictionalName.DOU4, division: 'SERIE_B' },
  { ticker: 'LEP4', name: SerieBClubFictionalName.LEP4, division: 'SERIE_B' },
  { ticker: 'PER3', name: SerieBClubFictionalName.PER3, division: 'SERIE_B' },
  { ticker: 'IND4', name: SerieBClubFictionalName.IND4, division: 'SERIE_B' },
  { ticker: 'TUB3', name: SerieBClubFictionalName.TUB3, division: 'SERIE_B' },
  { ticker: 'NAF3', name: SerieBClubFictionalName.NAF3, division: 'SERIE_B' },
  { ticker: 'TIV3', name: SerieBClubFictionalName.TIV3, division: 'SERIE_B' },
  { ticker: 'FAS3', name: SerieBClubFictionalName.FAS3, division: 'SERIE_B' },
  { ticker: 'MAC4', name: SerieBClubFictionalName.MAC4, division: 'SERIE_B' },
  { ticker: 'ABT4', name: SerieBClubFictionalName.ABT4, division: 'SERIE_B' },
  { ticker: 'LEI3', name: SerieBClubFictionalName.LEI3, division: 'SERIE_B' },
  { ticker: 'TIS3', name: SerieBClubFictionalName.TIS3, division: 'SERIE_B' },
]

/** Nome exibivel curto por ticker (app autenticado). */
export const CLUB_DISPLAY_NAMES: Record<string, string> = {
  URU3: 'Urubu da Gavea',
  POR4: 'Porco do Parque',
  TIM3: 'Timao do Sao Jorge',
  TRI4: 'Tricolor do Morumbi',
  GAL3: 'Galo da Lagoinha',
  FOG3: 'Estrela do General',
  COL3: 'Colorado do Beira-Rio',
  IMO3: 'Imortal da Arena',
  RAP3: 'Raposa do Mineirao',
  MAL4: 'Cruz de Malta',
  TRI3: 'Tricolor da Fonte Nova',
  GUE4: 'Guerreiro das Laranjeiras',
  TOR3: 'Touro do Nabi',
  LEM3: 'Leaozinho do Maiao',
  BAL4: 'Baleia da Vila',
  FUR3: 'Furacao do Capao',
  VOA4: 'Vovo Alemao',
  CON3: 'Conda da Arena Verde',
  LEA3: 'Leao Azul do Baenao',
  LEB3: 'Leao da Barra',
  COE3: 'Coelho do Calafate',
  CAV4: 'Cavalo de Tiradentes',
  DRA3: 'Dragao do Cerradao',
  LEI4: 'Leao da Ilha',
  PAN3: 'Pantera da Mogiana',
  VOZ3: 'Vovo do Castelao',
  GAP3: 'Galo da Pajucara',
  TIG4: 'Tigre do Heriberto',
  DOU4: 'Dourado do Pantanal',
  LEP4: 'Leao do Pici',
  PER3: 'Periquito da Serrinha',
  IND4: 'Indio da Serra Gaucha',
  TUB3: 'Tubarao do Cafe',
  NAF3: 'Timbu dos Aflitos',
  TIV3: 'Tigre do Vale do Peixe',
  FAS3: 'Fantasma dos Campos Gerais',
  MAC4: 'Macaca do Majestoso',
  ABT4: 'Tigre do Grande ABC',
  LEI3: 'Leao da Ilha do Retiro',
  TIS3: 'Tigre da Serra Dourada',
}

/**
 * Aliases de ticker para compatibilidade com dados legados e nomes reais.
 * Sempre converte para o ticker canonico do INTAKE.
 */
export const CLUB_TICKER_ALIASES: Record<string, string> = {
  // Serie A
  FLM3: 'URU3', FLA3: 'URU3', FLA4: 'URU3', FLM4: 'URU3',
  PAL3: 'POR4', PAL4: 'POR4', PALM4: 'POR4',
  COR3: 'TIM3', COR4: 'TIM3', CORI4: 'TIM3',
  SAO3: 'TRI4', SPFX4: 'TRI4',
  CAM3: 'GAL3', ATL3: 'GAL3', ATL4: 'GAL3',
  BOT3: 'FOG3', BOFA4: 'FOG3',
  INT3: 'COL3', INTS4: 'COL3',
  GRE3: 'IMO3', GREM4: 'IMO3',
  CRU3: 'RAP3', CRUZ4: 'RAP3',
  VAS3: 'MAL4', VAR1: 'MAL4',
  BAH3: 'TRI3',
  FLU3: 'GUE4',
  BRG3: 'TOR3', RBB3: 'TOR3',
  MIR3: 'LEM3',
  SAN3: 'BAL4',
  FOR3: 'LEP4',
  VIT3: 'LEB3',
  CHA3: 'CON3',
  REM3: 'LEA3',
  CFC3: 'VOA4',

  // Serie B
  VRD3: 'COE3', AME3: 'COE3',
  ATH4: 'CAV4', ATHM4: 'CAV4',
  ACG3: 'DRA3', GOI3: 'DRA3',
  AVA3: 'LEI4',
  BTC3: 'PAN3', BSA3: 'PAN3',
  CEC3: 'VOZ3',
  CRB3: 'GAP3',
  CUI3: 'DOU4',
  CGO3: 'PER3',
  JUV3: 'IND4',
  NAU3: 'NAF3',
  NTL3: 'TIV3', NOV3: 'TIV3',
  OPE3: 'FAS3',
  PON3: 'MAC4',
  SBR3: 'ABT4',
  SPT3: 'LEI3', SPO3: 'LEI3',
  PMB3: 'TIS3', VNO3: 'TIS3',
}

export function normalizeClubTicker(ticker: string): string {
  const normalized = ticker.trim().toUpperCase()
  return CLUB_TICKER_ALIASES[normalized] ?? normalized
}

export function getClubDisplayName(ticker: string, fallbackName?: string | null): string {
  const canonicalTicker = normalizeClubTicker(ticker)
  return CLUB_DISPLAY_NAMES[canonicalTicker] ?? fallbackName ?? canonicalTicker
}
