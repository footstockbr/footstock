// ============================================================================
// FootStock Motor — Estado (UF) por Ticker
// Usado para correlação regional inter-ativos (mesmo estado = rho bonus).
// INTAKE: clubes do mesmo estado recebem rho adicional de 0.10.
// ============================================================================

/**
 * Mapa de UF por ticker canônico do INTAKE.
 * Baseado nos clubes fictícios e seus correspondentes regionais reais.
 */
export const CLUB_STATE_BY_TICKER: Record<string, string> = {
  // Série A
  URU3: 'RJ',  // Urubu da Gavea (Flamengo-like)
  POR3: 'SP',  // Porco do Parque (Palmeiras-like)
  TIM3: 'SP',  // Timao do Sao Jorge (Corinthians-like)
  TRI3: 'SP',  // Tricolor do Morumbi (São Paulo-like)
  GAL3: 'MG',  // Galo da Lagoinha (Atlético MG-like)
  FOG3: 'RJ',  // Estrela do General Severiano (Botafogo-like)
  COL3: 'RS',  // Colorado do Beira-Rio (Internacional-like)
  IMO3: 'RS',  // Imortal da Arena (Grêmio-like)
  RAP3: 'MG',  // Raposa do Mineirao (Cruzeiro-like)
  MAL3: 'RJ',  // Cruz de Malta de Sao Januario (Vasco-like)
  TFN3: 'BA',  // Tricolor da Fonte Nova (Bahia-like)
  GUE3: 'RJ',  // Guerreiro das Laranjeiras (Fluminense-like)
  TOR3: 'SP',  // Touro do Nabi (Red Bull Bragantino-like)
  LEM3: 'SP',  // Leaozinho do Maiao (Mirassol-like)
  BAL3: 'SP',  // Baleia da Vila Belmiro (Santos-like)
  FUR3: 'PR',  // Furacao do Capao da Imbuia (Athletico PR-like)
  VOA3: 'PR',  // Vovo Alemao do Couto (Coritiba-like)
  CON3: 'SC',  // Conda da Arena Verde (Chapecoense-like)
  LEA3: 'PA',  // Leao Azul do Baenao (Remo-like)
  LEB3: 'BA',  // Leao da Barra (Vitória-like)

  // Série B
  COE3: 'MG',  // Coelho do Calafate (América MG-like)
  CAV3: 'MG',  // Cavalo de Tiradentes (Tombense-like)
  DRA3: 'GO',  // Dragao do Cerradao (Atlético GO-like)
  LDI3: 'SC',  // Leao da Ilha (Avaí-like)
  PAN3: 'SP',  // Pantera da Mogiana (Botafogo SP-like)
  VOZ3: 'CE',  // Vovo do Castelao (Ceará-like)
  GAP3: 'AL',  // Galo da Pajucara (CRB-like)
  TIG3: 'SC',  // Tigre do Heriberto (Joinville-like)
  DOU3: 'MT',  // Dourado do Pantanal (Cuiabá-like)
  LEP3: 'CE',  // Leao do Pici (Fortaleza-like)
  PER3: 'GO',  // Periquito da Serrinha (Goiás-like)
  IND3: 'RS',  // Indio da Serra Gaucha (Juventude-like)
  TUB3: 'SP',  // Tubarao do Cafe (Guarani-like)
  NAF3: 'PE',  // Timbu dos Aflitos (Náutico-like)
  TIV3: 'SC',  // Tigre do Vale do Peixe (Joinville/Criciúma-like)
  FAS3: 'PR',  // Fantasma dos Campos Gerais (Operário PR-like)
  MAC3: 'SP',  // Macaca do Majestoso (Ponte Preta-like)
  ABT3: 'SP',  // Tigre do Grande ABC (São Bernardo-like)
  LEI3: 'PE',  // Leao da Ilha do Retiro (Sport-like)
  TIS3: 'GO',  // Tigre da Serra Dourada (Vila Nova-like)
}
