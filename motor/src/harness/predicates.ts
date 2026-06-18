// ============================================================================
// FootStock Motor — Harness de medicao (Item 003 / loop 06-17)
//
// Predicados CA1..CA6 + diagnosticos, computados sobre a serie de ticks de um
// ativo. Funcoes PURAS e DETERMINISTICAS: a mesma serie produz os mesmos numeros.
// (O "custo aproximado" e medido fora daqui e NAO entra na igualdade do golden,
// por ser wall-clock e portanto nao-deterministico.)
// ============================================================================

/** Registro por tick coletado pelo loop do harness (campos ja computados). */
export interface TickRecord {
  /** finalPrice / prevPrice - 1 (variacao relativa do tick, pos-agentes). */
  ret: number
  /** Impacto agregado dos agentes neste tick (ja com cap +-2% aplicado). */
  agentImpact: number
  /** OFI state apos o calculate() deste tick (decaimento exponencial). */
  ofiState: number
  /** deltaPrice da camada L5_KyleLambda neste tick (impacto de mercado). */
  l5Delta: number
  /** true quando o preco final mudou em relacao ao anterior (>= 1 centesimo). */
  priceChanged: boolean
  /** true quando finalPrice/ret/etc. tiveram NaN ou Infinity. */
  nonFinite: boolean
  /** Item T1.1: true quando o MarketMaker tomou um lado (BUY/SELL) neste tick,
   *  i.e. spread fracional >= TARGET_SPREAD. false em HOLD/spread_tight/CLOSED. */
  marketMakerActive: boolean
}

/** Quantil linear-interpolado de um array JA ordenado asc. Deterministico. */
function quantileSorted(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0
  if (sortedAsc.length === 1) return sortedAsc[0]
  const pos = (sortedAsc.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sortedAsc[lo]
  const frac = pos - lo
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

/** Arredonda para `digits` casas para estabilizar a igualdade do golden. */
export function round(value: number, digits = 8): number {
  if (!Number.isFinite(value)) return 0
  const f = Math.pow(10, digits)
  return Math.round(value * f) / f
}

/** Predicados locais CA1..CA6 de um ativo. Todos os valores arredondados. */
export interface AssetPredicates {
  ticker: string
  totalTicks: number
  /** CA1: distribuicao de |ret| (sintoma do serrilhado ~2%/tick). */
  CA1_absReturn: { p50: number; p95: number; p99: number; max: number }
  /** CA2: fracao de ticks com |ret| > 0,35% (trava de velocidade furada). */
  CA2_pctAbove0_35: number
  /** CA3: fracao de ticks com |agentImpact| >= 1,9% (impacto saturado no cap). */
  CA3_pctAgentSaturated: number
  /** CA4: decaimento do ofiState em book equilibrado (deve tender a ~0). */
  CA4_ofiDecay: { meanAbs: number; maxAbs: number; final: number }
  /** CA5: impacto medio do L5 (KyleLambda) em book equilibrado (~0 esperado). */
  CA5_l5MeanImpact: { mean: number; meanAbs: number }
  /** CA6: fracao de ticks "mercado morto" (preco nao mudou). */
  CA6_pctDeadMarket: number
  /** Item T1.1: fracao de ticks com o MarketMaker ativo (lado != HOLD). Mede o
   *  disparo do MM: ~1.0 sob o bug de unidade pre-fix; cai em book estreito (A_TOP,
   *  spread 0,05% < 0,1%) e permanece alto em book largo (B_ILLIQ, 1,5%). */
  MM_pctActive: number
  /** Diagnostico: contagem de NaN/Infinity (deve ser 0). */
  nonFiniteCount: number
}

/** Computa CA1..CA6 a partir da serie de ticks de UM ativo. */
export function computeAssetPredicates(ticker: string, records: TickRecord[]): AssetPredicates {
  const n = records.length
  const absReturns: number[] = []
  let above0_35 = 0
  let agentSaturated = 0
  let dead = 0
  let mmActive = 0
  let nonFinite = 0
  const ofiAbs: number[] = []
  const l5: number[] = []
  let maxOfiAbs = 0
  let finalOfi = 0

  for (const r of records) {
    if (r.nonFinite) nonFinite++
    const a = Math.abs(r.ret)
    absReturns.push(a)
    if (a > 0.0035) above0_35++
    if (Math.abs(r.agentImpact) >= 0.019) agentSaturated++
    if (!r.priceChanged) dead++
    if (r.marketMakerActive) mmActive++
    const oa = Math.abs(r.ofiState)
    ofiAbs.push(oa)
    if (oa > maxOfiAbs) maxOfiAbs = oa
    finalOfi = r.ofiState
    l5.push(r.l5Delta)
  }

  const sorted = absReturns.slice().sort((x, y) => x - y)
  const denom = n > 0 ? n : 1

  return {
    ticker,
    totalTicks: n,
    CA1_absReturn: {
      p50: round(quantileSorted(sorted, 0.5)),
      p95: round(quantileSorted(sorted, 0.95)),
      p99: round(quantileSorted(sorted, 0.99)),
      max: round(sorted.length ? sorted[sorted.length - 1] : 0),
    },
    CA2_pctAbove0_35: round(above0_35 / denom, 6),
    CA3_pctAgentSaturated: round(agentSaturated / denom, 6),
    CA4_ofiDecay: {
      meanAbs: round(mean(ofiAbs)),
      maxAbs: round(maxOfiAbs),
      final: round(finalOfi),
    },
    CA5_l5MeanImpact: {
      mean: round(mean(l5)),
      meanAbs: round(mean(l5.map((x) => Math.abs(x)))),
    },
    CA6_pctDeadMarket: round(dead / denom, 6),
    MM_pctActive: round(mmActive / denom, 6),
    nonFiniteCount: nonFinite,
  }
}
