// ============================================================================
// FootStock — Tabela de Precificação IPO 2026 (fonte canônica única)
// Fonte: "Fundamentos Econômico-Financeiros e Precificação IPO" (Abril 2026,
//        Vinicius Paiva / Economista-Chefe). Seções 05 (Série A) e 06 (Série B).
//        Base: Relatório Convocados 2025 (exercício 2024). FS$1,00 = R$1,00.
//
// fairValue = Preço IPO = âncora inicial do motor (L2 mean reversion).
// shares    = número de cotas (Passo 5: Float / preço-alvo, lote 50.000).
// rating    = Rating Convocados (rastreabilidade; ** = estimado por analogia).
//
// Consumido por: seed (assets.seed.ts), endpoint admin restore-from-seed.
// O motor (projeto motor/) mantém uma cópia dos fairValues em CANONICAL_FAIR_VALUES
// — manter ambos em sincronia ao recalibrar (ex.: Convocados 2026).
// ============================================================================

export interface IpoPricingEntry {
  fairValue: number
  shares: number
  rating: string
  /** true quando os fundamentos são estimados por analogia (sujeito a revisão) */
  estimated?: boolean
}

// ─── Série A 2026 (faixa FS$8,00 – FS$40,00) ────────────────────────────────
const SERIE_A: Record<string, IpoPricingEntry> = {
  URU3: { fairValue: 40.00, shares: 23_950_000, rating: 'BBB+' }, // Flamengo
  POR4: { fairValue: 36.76, shares: 20_900_000, rating: 'BBB' },  // Palmeiras
  TIM3: { fairValue: 33.60, shares: 500_000,    rating: 'C' },    // Corinthians
  TRI4: { fairValue: 32.21, shares: 500_000,    rating: 'C' },    // São Paulo
  GUE4: { fairValue: 28.60, shares: 4_200_000,  rating: 'B' },    // Fluminense
  GAL3: { fairValue: 26.01, shares: 350_000,    rating: 'D' },    // Atlético-MG
  FOG3: { fairValue: 23.14, shares: 350_000,    rating: 'C' },    // Botafogo
  COL3: { fairValue: 22.75, shares: 500_000,    rating: 'C' },    // Internacional
  TOR3: { fairValue: 20.29, shares: 20_800_000, rating: 'BBB+' }, // RB Bragantino
  FUR3: { fairValue: 18.65, shares: 24_450_000, rating: 'AA' },   // Athletico-PR
  IMO3: { fairValue: 17.18, shares: 12_100_000, rating: 'BBB' },  // Grêmio
  BAL4: { fairValue: 16.35, shares: 400_000,    rating: 'C' },    // Santos
  MAL4: { fairValue: 15.30, shares: 400_000,    rating: 'D' },    // Vasco
  RAP3: { fairValue: 13.95, shares: 400_000,    rating: 'B' },    // Cruzeiro
  TRI3: { fairValue: 12.22, shares: 12_400_000, rating: 'B' },    // Bahia
  LEB3: { fairValue: 11.28, shares: 3_550_000,  rating: 'B' },    // Vitória
  VOA4: { fairValue: 10.45, shares: 1_600_000,  rating: 'B' },    // Coritiba
  LEM3: { fairValue: 9.47,  shares: 6_650_000,  rating: 'A' },    // Mirassol
  CON3: { fairValue: 8.07,  shares: 150_000,    rating: 'C' },    // Chapecoense
  LEA3: { fairValue: 8.00,  shares: 350_000,    rating: 'C' },    // Remo
}

// ─── Série B 2026 (faixa FS$3,00 – FS$12,00) ────────────────────────────────
const SERIE_B: Record<string, IpoPricingEntry> = {
  LEP4: { fairValue: 12.00, shares: 8_100_000,  rating: 'BB' },   // Fortaleza
  VOZ3: { fairValue: 10.56, shares: 250_000,    rating: 'C' },    // Ceará
  LEI3: { fairValue: 8.80,  shares: 250_000,    rating: 'C' },    // Sport
  COE3: { fairValue: 8.00,  shares: 150_000,    rating: 'D' },    // América-MG
  IND4: { fairValue: 8.32,  shares: 11_500_000, rating: 'AA' },   // Juventude
  DOU4: { fairValue: 11.15, shares: 14_200_000, rating: 'A' },    // Cuiabá
  GAP3: { fairValue: 5.78,  shares: 8_300_000,  rating: 'BBB+' }, // CRB
  TIG4: { fairValue: 8.98,  shares: 9_850_000,  rating: 'A' },    // Criciúma
  PER3: { fairValue: 4.51,  shares: 200_000,    rating: 'C' },    // Goiás
  DRA3: { fairValue: 7.19,  shares: 8_800_000,  rating: 'BBB+' }, // Atlético-GO
  LEI4: { fairValue: 7.00,  shares: 150_000,    rating: 'C' },    // Avaí
  PAN3: { fairValue: 4.79,  shares: 200_000,    rating: 'C' },    // Botafogo-SP
  TIV3: { fairValue: 5.83,  shares: 100_000,    rating: 'D' },    // Novorizontino
  TIS3: { fairValue: 5.40,  shares: 5_000_000,  rating: 'BB' },   // Vila Nova
  FAS3: { fairValue: 4.33,  shares: 6_000_000,  rating: 'BBB' },  // Operário-PR
  MAC4: { fairValue: 3.75,  shares: 100_000,    rating: 'E' },    // Ponte Preta
  NAF3: { fairValue: 3.75,  shares: 100_000,    rating: 'E' },    // Náutico
  ABT4: { fairValue: 3.00,  shares: 4_900_000,  rating: 'BBB', estimated: true }, // São Bernardo (analogia)
  TUB3: { fairValue: 3.22,  shares: 2_050_000,  rating: 'BBB' },  // Londrina
  CAV4: { fairValue: 3.03,  shares: 1_950_000,  rating: 'BB' },   // Athletic Club
}

/** Tabela canônica de precificação IPO 2026 (40 ativos, ticker → entrada) */
export const IPO_PRICING_2026: Record<string, IpoPricingEntry> = {
  ...SERIE_A,
  ...SERIE_B,
}

/** Mapa simples ticker → fairValue (Preço IPO) — usado por recuperação/validação */
export const IPO_FAIR_VALUES_2026: Record<string, number> = Object.fromEntries(
  Object.entries(IPO_PRICING_2026).map(([ticker, e]) => [ticker, e.fairValue]),
)
