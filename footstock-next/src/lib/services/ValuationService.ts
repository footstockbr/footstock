// ============================================================================
// ValuationService — Metodologia de Precificação IPO FootStock
// Fonte: "Fundamentos Econômico-Financeiros e Precificação IPO" (Abril 2026,
//        Vinicius Paiva / Economista-Chefe). Base: Relatório Convocados 2025
//        (exercício 2024). Paridade FS$1,00 = R$1,00 no lançamento.
//
// Substitui a metodologia anterior (Sports Value: receita×3 + patrimônio×0.5),
// abandonada pelo documento por usar valor de marca/plantel (estimativas de
// terceiros, não-auditáveis) em vez de receita auditada × rating de crédito.
//
// Fórmula de 5 passos (única e rastreável — componente único receita×rating):
//   1. EV = receita_2024 × múltiplo(rating);  Equity = max(EV − dívida, 10% receita)
//   2. Free-float % = f(dívida/receita)
//   3. Float (R$) = Equity × free-float%
//   4. Preço-alvo = escala logarítmica por receita dentro da divisão (faixa rígida)
//   5. Cotas = round(Float / preço-alvo, lote 50.000);  IPO = Float / cotas
//      Fair Value inicial do motor (L2 mean reversion) = Preço IPO
// ============================================================================

/** Rating Convocados (escala AAA→E) */
export type ConvocadosRating = 'AAA' | 'AA' | 'A' | 'BBB+' | 'BBB' | 'BB' | 'B' | 'C' | 'D' | 'E'

export type ValuationDivision = 'SERIE_A' | 'SERIE_B'

// ─── Passo 1: múltiplo de Enterprise Value por rating ───────────────────────
const RATING_EV_MULTIPLE: Record<ConvocadosRating, number> = {
  AAA: 4.0,
  AA: 4.0,
  A: 3.5,
  'BBB+': 3.0,
  BBB: 3.0,
  BB: 2.5,
  B: 2.0,
  C: 1.5,
  D: 1.2,
  E: 1.0,
}

/** Piso do Equity: 10% da receita (garante que nenhum clube chegue a equity zero) */
const EQUITY_FLOOR_PCT = 0.10

// ─── Passo 4: faixas rígidas de preço por divisão (piso/teto absolutos) ──────
const DIVISION_PRICE_RANGE: Record<ValuationDivision, { min: number; max: number }> = {
  SERIE_A: { min: 8, max: 40 },
  SERIE_B: { min: 3, max: 12 },
}

// ─── Passo 5: lote mínimo de cotas ──────────────────────────────────────────
const SHARE_LOT = 50_000

// ─── Entradas e saídas ──────────────────────────────────────────────────────

/** Fundamentos econômico-financeiros de um clube (exercício 2024) */
export interface ClubFinancials {
  ticker: string
  division: ValuationDivision
  /** Receita total 2024 em R$ */
  revenue: number
  /** Rating Convocados */
  rating: ConvocadosRating
  /** Dívida operacional estimada em R$ */
  debt: number
}

/** Resultado completo da precificação IPO de um clube */
export interface IPOPricing {
  ticker: string
  division: ValuationDivision
  enterpriseValue: number
  equityValue: number
  debtToRevenue: number
  freeFloatPct: number
  floatBRL: number
  targetPrice: number
  shares: number
  ipoPrice: number
  /** Fair Value inicial do motor (= ipoPrice) */
  fairValue: number
}

// ─── Passo 1 — Enterprise Value e Equity ────────────────────────────────────

/** EV = receita × múltiplo(rating) */
export function calculateEnterpriseValue(revenue: number, rating: ConvocadosRating): number {
  return revenue * RATING_EV_MULTIPLE[rating]
}

/** Equity = max(EV − dívida, 10% da receita) */
export function calculateEquity(enterpriseValue: number, debt: number, revenue: number): number {
  return Math.max(enterpriseValue - debt, revenue * EQUITY_FLOOR_PCT)
}

// ─── Passo 2 — Free-float por Dívida/Receita ────────────────────────────────

/** Free-float %: <1,0x → 30%; 1,0–2,0x → 22%; >2,0x → 15% */
export function calculateFreeFloatPct(debtToRevenue: number): number {
  if (debtToRevenue < 1.0) return 0.30
  if (debtToRevenue <= 2.0) return 0.22
  return 0.15
}

// ─── Passo 4 — Preço-alvo por escala logarítmica (dentro da divisão) ─────────

/**
 * Preço-alvo por escala logarítmica: o clube de maior receita recebe o teto da
 * faixa, o de menor recebe o piso; os intermediários são interpolados em log.
 * Se houver um único clube (ou receitas iguais), retorna o teto da faixa.
 */
export function calculateLogTargetPrice(
  revenue: number,
  minRevenue: number,
  maxRevenue: number,
  division: ValuationDivision,
): number {
  const { min, max } = DIVISION_PRICE_RANGE[division]
  if (maxRevenue <= minRevenue || revenue <= 0) return max
  const normalized =
    (Math.log(revenue) - Math.log(minRevenue)) / (Math.log(maxRevenue) - Math.log(minRevenue))
  const clamped = Math.max(0, Math.min(1, normalized))
  return min + clamped * (max - min)
}

// ─── Passo 5 — Número de cotas e preço IPO final ────────────────────────────

/** Cotas = round(Float / preço-alvo) ao múltiplo de 50.000 mais próximo (mínimo 1 lote) */
export function calculateShares(floatBRL: number, targetPrice: number): number {
  if (targetPrice <= 0) throw new Error('targetPrice deve ser positivo')
  const raw = floatBRL / targetPrice
  const rounded = Math.round(raw / SHARE_LOT) * SHARE_LOT
  return Math.max(SHARE_LOT, rounded)
}

// ─── Orquestrador por divisão ───────────────────────────────────────────────

/**
 * Precifica todos os clubes de UMA divisão (Passo 4 exige o ranking de receita
 * da divisão inteira). Retorna o IPO/Fair Value de cada clube, com faixa rígida.
 *
 * @param clubs lista de clubes da MESMA divisão com seus fundamentos 2024
 */
export function priceDivision(clubs: ClubFinancials[]): IPOPricing[] {
  if (clubs.length === 0) return []

  const revenues = clubs.map((c) => c.revenue).filter((r) => r > 0)
  const minRevenue = Math.min(...revenues)
  const maxRevenue = Math.max(...revenues)

  return clubs.map((club) => {
    const enterpriseValue = calculateEnterpriseValue(club.revenue, club.rating)
    const equityValue = calculateEquity(enterpriseValue, club.debt, club.revenue)
    const debtToRevenue = club.revenue > 0 ? club.debt / club.revenue : Infinity
    const freeFloatPct = calculateFreeFloatPct(debtToRevenue)
    const floatBRL = equityValue * freeFloatPct
    const targetPrice = calculateLogTargetPrice(club.revenue, minRevenue, maxRevenue, club.division)
    const shares = calculateShares(floatBRL, targetPrice)
    const ipoPrice = parseFloat((floatBRL / shares).toFixed(2))

    return {
      ticker: club.ticker,
      division: club.division,
      enterpriseValue,
      equityValue,
      debtToRevenue: parseFloat(debtToRevenue.toFixed(4)),
      freeFloatPct,
      floatBRL,
      targetPrice: parseFloat(targetPrice.toFixed(2)),
      shares,
      ipoPrice,
      fairValue: ipoPrice,
    }
  })
}

export const RATING_EV_MULTIPLE_TABLE = RATING_EV_MULTIPLE
export const DIVISION_PRICE_RANGE_TABLE = DIVISION_PRICE_RANGE
export const SHARE_LOT_SIZE = SHARE_LOT
