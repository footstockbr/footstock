// ============================================================================
// Foot Stock Motor — Tipos locais para o módulo de notícias
// ImpactCategory espelhada do schema Prisma (não importar @prisma/client diretamente)
// ============================================================================

/** Categorias de impacto de notícias — INTAKE canônico (espelho do enum Prisma) */
export enum ImpactCategory {
  FINANCEIRA_CRITICA = 'FINANCEIRA_CRITICA',         // +/-5%
  ESPORTIVA_MAJORITARIA = 'ESPORTIVA_MAJORITARIA',   // +/-3%
  MERCADO_ATIVOS = 'MERCADO_ATIVOS',                 // +/-2%
  INTEGRIDADE_SAUDE = 'INTEGRIDADE_SAUDE',           // +/-1.5%
  INSTITUCIONAL = 'INSTITUCIONAL',                   // +/-1%
  ESPORTIVA_MENOR = 'ESPORTIVA_MENOR',               // +/-0.5%
}

/** Magnitude de impacto por categoria (fração do preço) */
export const IMPACT_MAGNITUDE: Record<ImpactCategory, number> = {
  [ImpactCategory.FINANCEIRA_CRITICA]: 0.05,
  [ImpactCategory.ESPORTIVA_MAJORITARIA]: 0.03,
  [ImpactCategory.MERCADO_ATIVOS]: 0.02,
  [ImpactCategory.INTEGRIDADE_SAUDE]: 0.015,
  [ImpactCategory.INSTITUCIONAL]: 0.01,
  [ImpactCategory.ESPORTIVA_MENOR]: 0.005,
}
