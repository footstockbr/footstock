export interface ClubOption {
  ticker: string
  name: string
  division: 'SERIE_A' | 'SERIE_B'
}

/** 40 clubes do futebol brasileiro (Série A + B) */
export const CLUBS: ClubOption[] = [
  // Série A (20 clubes)
  { ticker: 'FLM3', name: 'Flamengo', division: 'SERIE_A' },
  { ticker: 'PAL3', name: 'Palmeiras', division: 'SERIE_A' },
  { ticker: 'COR3', name: 'Corinthians', division: 'SERIE_A' },
  { ticker: 'SAO3', name: 'São Paulo', division: 'SERIE_A' },
  { ticker: 'CAM3', name: 'Atlético-MG', division: 'SERIE_A' },
  { ticker: 'GRE3', name: 'Grêmio', division: 'SERIE_A' },
  { ticker: 'INT3', name: 'Internacional', division: 'SERIE_A' },
  { ticker: 'FLU3', name: 'Fluminense', division: 'SERIE_A' },
  { ticker: 'SAN3', name: 'Santos', division: 'SERIE_A' },
  { ticker: 'VAS3', name: 'Vasco', division: 'SERIE_A' },
  { ticker: 'BOT3', name: 'Botafogo', division: 'SERIE_A' },
  { ticker: 'CAP3', name: 'Athletico-PR', division: 'SERIE_A' },
  { ticker: 'FOR3', name: 'Fortaleza', division: 'SERIE_A' },
  { ticker: 'BAH3', name: 'Bahia', division: 'SERIE_A' },
  { ticker: 'CRU3', name: 'Cruzeiro', division: 'SERIE_A' },
  { ticker: 'RBB3', name: 'RB Bragantino', division: 'SERIE_A' },
  { ticker: 'CUI3', name: 'Cuiabá', division: 'SERIE_A' },
  { ticker: 'VIT3', name: 'Vitória', division: 'SERIE_A' },
  { ticker: 'JUV3', name: 'Juventude', division: 'SERIE_A' },
  { ticker: 'MIR3', name: 'Mirassol', division: 'SERIE_A' },
  // Série B (20 clubes)
  { ticker: 'SPO3', name: 'Sport', division: 'SERIE_B' },
  { ticker: 'NTL3', name: 'Novorizontino', division: 'SERIE_B' },
  { ticker: 'AVA3', name: 'Avaí', division: 'SERIE_B' },
  { ticker: 'GOI3', name: 'Goiás', division: 'SERIE_B' },
  { ticker: 'CHA3', name: 'Chapecoense', division: 'SERIE_B' },
  { ticker: 'PON3', name: 'Ponte Preta', division: 'SERIE_B' },
  { ticker: 'GUA3', name: 'Guarani', division: 'SERIE_B' },
  { ticker: 'OPE3', name: 'Operário', division: 'SERIE_B' },
  { ticker: 'SAM3', name: 'Sampaio Corrêa', division: 'SERIE_B' },
  { ticker: 'VIL3', name: 'Vila Nova', division: 'SERIE_B' },
  { ticker: 'LON3', name: 'Londrina', division: 'SERIE_B' },
  { ticker: 'FIG3', name: 'Figueirense', division: 'SERIE_B' },
  { ticker: 'PAY3', name: 'Paysandu', division: 'SERIE_B' },
  { ticker: 'CFC3', name: 'Coritiba', division: 'SERIE_B' },
  { ticker: 'AME3', name: 'América-MG', division: 'SERIE_B' },
  { ticker: 'BSA3', name: 'Botafogo-SP', division: 'SERIE_B' },
  { ticker: 'CRB3', name: 'CRB', division: 'SERIE_B' },
  { ticker: 'CSA3', name: 'CSA', division: 'SERIE_B' },
  { ticker: 'ITA3', name: 'Ituano', division: 'SERIE_B' },
  { ticker: 'TON3', name: 'Tombense', division: 'SERIE_B' },
]

/**
 * Mapeamento ticker → displayName (nome fictício usado na plataforma após cadastro).
 * O nome real do clube é exibido APENAS na tela de seleção do cadastro.
 */
export const CLUB_DISPLAY_NAMES: Record<string, string> = {
  FLM3: 'Urubu da Gávea',
  PAL3: 'Porco do Parque',
  COR3: 'Mosqueteiro do Timão',
  SAO3: 'Tricolor do Morumbi',
  CAM3: 'Galo das Alterosas',
  GRE3: 'Imortal do Sul',
  INT3: 'Colorado da Beira-Rio',
  FLU3: 'Tricolor das Laranjeiras',
  SAN3: 'Peixe da Baixada',
  VAS3: 'Gigante da Colina',
  BOT3: 'Estrela Solitária',
  CAP3: 'Furacão do Paraná',
  FOR3: 'Leão do Pici',
  BAH3: 'Esquadrão de Aço',
  CRU3: 'Raposa de Minas',
  RBB3: 'Toro Loco',
  CUI3: 'Dourado do Cerrado',
  VIT3: 'Leão da Barra',
  JUV3: 'Papo da Serra',
  MIR3: 'Leão do Interior',
}
