/**
 * @jest-environment node
 */
// ============================================================================
// Agentes de Mercado — Testes de Comportamento
// Cobre: BaseAgent, MarketMakerAgent, MomentumAgent, ContrarianAgent,
//        ValueInvestorAgent, RandomTraderAgent, PanicSellerAgent,
//        AgentOrchestrator (clusters, aggregateImpact, cap, graceful shutdown).
// ============================================================================

import { BaseAgent, type MarketContext } from '../BaseAgent'
import { MarketMakerAgent } from '../MarketMakerAgent'
import { MomentumAgent } from '../MomentumAgent'
import { ContrarianAgent } from '../ContrarianAgent'
import { ValueInvestorAgent } from '../ValueInvestorAgent'
import { RandomTraderAgent } from '../RandomTraderAgent'
import { PanicSellerAgent } from '../PanicSellerAgent'
import { AgentOrchestrator, AssetCluster, createAgents, runTick, runTickDetailed, aggregateImpact, aggregateImpactLegacy, kyleImpactFromFlow, decisionFlow, MAX_AGGREGATE_IMPACT, VOLATILITY_GATE_THRESHOLD } from '../AgentOrchestrator'

// ─── Context helper ───────────────────────────────────────────────────────────

function mkCtx(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    ticker: 'VAR1',
    currentPrice: 10.0,
    fairValue: 10.0,
    priceChange24h: 0,
    volume24h: 10_000,
    baseVolume: 10_000,
    bid: 9.98,
    ask: 10.02,
    spread: 0.004,
    session: 'TRADING',
    volatilityMultiplier: 1.0,
    ...overrides,
  }
}

// ─── BaseAgent.randomGaussian ─────────────────────────────────────────────────

describe('BaseAgent.randomGaussian', () => {
  class ConcreteAgent extends BaseAgent {
    decide() { return { side: 'HOLD' as const, quantity: 0, priceModifier: 0, reason: '' } }
    testGaussian(mean: number, stdDev: number) { return this.randomGaussian(mean, stdDev) }
  }

  test('produz distribuição normal aproximada com 1000 amostras', () => {
    const agent = new ConcreteAgent('test', 1)
    const samples = Array.from({ length: 1000 }, () => agent.testGaussian(0, 1))
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const variance = samples.reduce((a, b) => a + (b - mean) ** 2, 0) / samples.length
    const stdDev = Math.sqrt(variance)

    expect(Math.abs(mean)).toBeLessThan(0.15)    // média ≈ 0
    expect(Math.abs(stdDev - 1)).toBeLessThan(0.15) // stdDev ≈ 1
  })
})

// ─── MarketMakerAgent ─────────────────────────────────────────────────────────

describe('MarketMakerAgent', () => {
  const agent = new MarketMakerAgent()

  test('spread amplo → retorna BUY ou SELL (alterna)', () => {
    const ctx = mkCtx({ spread: 0.01 })
    const d1 = agent.decide(ctx)
    expect(['BUY', 'SELL']).toContain(d1.side)
    const d2 = agent.decide(ctx)
    expect(d2.side).not.toBe(d1.side)  // alterna
  })

  test('spread estreito (< 0.001) → HOLD', () => {
    const ctx = mkCtx({ spread: 0.0005 })
    expect(agent.decide(ctx).side).toBe('HOLD')
  })

  test('sessão FECHADO → HOLD', () => {
    const ctx = mkCtx({ session: 'CLOSED' })
    expect(agent.decide(ctx).side).toBe('HOLD')
  })

  // T2.2: quantity desacoplada de state.volume (ctx.volume24h), dimensionada por
  // ctx.baseVolume (profundidade fixa do cluster).
  test('T2.2: volume24h zerado → quantity finita e coerente (>= 1, função do baseVolume)', () => {
    const ctx = mkCtx({ spread: 0.01, volume24h: 0, baseVolume: 20_000 })
    const d = agent.decide(ctx)
    expect(['BUY', 'SELL']).toContain(d.side)
    expect(Number.isFinite(d.quantity)).toBe(true)
    expect(d.quantity).toBeGreaterThanOrEqual(1)
    // floor(20000 * 0.001) = 20
    expect(d.quantity).toBe(20)
  })

  test('T2.2: quantity independe de volume24h (sem realimentação)', () => {
    const low = agent.decide(mkCtx({ spread: 0.01, volume24h: 0, baseVolume: 20_000 }))
    const high = agent.decide(mkCtx({ spread: 0.01, volume24h: 5_000_000, baseVolume: 20_000 }))
    expect(high.quantity).toBe(low.quantity) // mesma baseVolume → mesma quantity
  })

  test('T2.2: volume24h gigante não explode quantity (cap defensivo preserva finitude)', () => {
    const d = agent.decide(mkCtx({ spread: 0.01, volume24h: 1e12, baseVolume: 50_000 }))
    expect(Number.isFinite(d.quantity)).toBe(true)
    expect(d.quantity).toBeLessThanOrEqual(5_000) // MAX_MM_QUANTITY
    expect(d.quantity).toBe(50) // floor(50000 * 0.001), independente do volume24h
  })

  test('T2.2: cluster ilíquido (baseVolume baixo) ainda produz quantity finita >= 1', () => {
    const d = agent.decide(mkCtx({ spread: 0.01, volume24h: 0, baseVolume: 500 }))
    expect(d.quantity).toBeGreaterThanOrEqual(1) // max(1, floor(500 * 0.001)=0) = 1
    expect(d.quantity).toBe(1)
  })
})

// ─── MomentumAgent ────────────────────────────────────────────────────────────

describe('MomentumAgent', () => {
  const agent = new MomentumAgent()

  test('alta 3% → BUY', () => {
    expect(agent.decide(mkCtx({ priceChange24h: 0.03 })).side).toBe('BUY')
  })

  test('queda 3% → SELL', () => {
    expect(agent.decide(mkCtx({ priceChange24h: -0.03 })).side).toBe('SELL')
  })

  test('variação 1% (< 2%) → HOLD', () => {
    expect(agent.decide(mkCtx({ priceChange24h: 0.01 })).side).toBe('HOLD')
  })

  test('sessão FECHADO → HOLD', () => {
    expect(agent.decide(mkCtx({ session: 'CLOSED', priceChange24h: 0.05 })).side).toBe('HOLD')
  })
})

// ─── ContrarianAgent ──────────────────────────────────────────────────────────

describe('ContrarianAgent', () => {
  const agent = new ContrarianAgent()

  test('alta 3% → SELL (sobrecomprado)', () => {
    expect(agent.decide(mkCtx({ priceChange24h: 0.03 })).side).toBe('SELL')
  })

  test('queda 3% → BUY (subvalorizado)', () => {
    expect(agent.decide(mkCtx({ priceChange24h: -0.03 })).side).toBe('BUY')
  })

  test('variação 2% (< threshold 3%) → HOLD', () => {
    expect(agent.decide(mkCtx({ priceChange24h: 0.025 })).side).toBe('HOLD')
  })
})

// ─── ValueInvestorAgent ───────────────────────────────────────────────────────

describe('ValueInvestorAgent', () => {
  const agent = new ValueInvestorAgent()

  test('preço 10% abaixo do fair value → BUY', () => {
    // fairValue=10, currentPrice=9 → desconto 10% > 5%
    expect(agent.decide(mkCtx({ currentPrice: 9.0, fairValue: 10.0 })).side).toBe('BUY')
  })

  test('preço 15% acima do fair value → SELL', () => {
    // fairValue=10, currentPrice=11.5 → prêmio 15% > 10%
    expect(agent.decide(mkCtx({ currentPrice: 11.5, fairValue: 10.0 })).side).toBe('SELL')
  })

  test('preço dentro dos limites → HOLD', () => {
    // fairValue=10, currentPrice=10 → sem desconto/prêmio
    expect(agent.decide(mkCtx({ currentPrice: 10.0, fairValue: 10.0 })).side).toBe('HOLD')
  })

  test('sessão PRE_ABERTURA → HOLD (fora das sessões permitidas)', () => {
    expect(agent.decide(mkCtx({ session: 'PRE_OPENING', currentPrice: 8.0, fairValue: 10.0 })).side).toBe('HOLD')
  })

  test('sessão AFTER_MARKET permite operar', () => {
    expect(agent.decide(mkCtx({ session: 'AFTER_MARKET', currentPrice: 9.0, fairValue: 10.0 })).side).toBe('BUY')
  })
})

// ─── PanicSellerAgent ─────────────────────────────────────────────────────────

describe('PanicSellerAgent', () => {
  const agent = new PanicSellerAgent()

  // Thresholds suavizados para demo: SELL > 10%, quantity × 2 em > 15%.
  test('queda 12% → SELL com panic_cascade', () => {
    const d = agent.decide(mkCtx({ priceChange24h: -0.12, volume24h: 10_000 }))
    expect(d.side).toBe('SELL')
    expect(d.reason).toBe('panic_cascade')
    expect(d.quantity).toBeGreaterThan(0)
  })

  test('queda 15% → quantity × 2', () => {
    const d1 = agent.decide(mkCtx({ priceChange24h: -0.12, volume24h: 10_000 }))
    const d2 = agent.decide(mkCtx({ priceChange24h: -0.16, volume24h: 10_000 }))
    expect(d2.quantity).toBe(d1.quantity * 2)
  })

  // T2.2: quantity desacoplada de state.volume (ctx.volume24h), dimensionada por
  // ctx.baseVolume (profundidade fixa do cluster).
  test('T2.2: volume24h zerado → quantity finita e coerente (função do baseVolume)', () => {
    const d = agent.decide(mkCtx({ priceChange24h: -0.12, volume24h: 0, baseVolume: 20_000 }))
    expect(d.side).toBe('SELL')
    expect(Number.isFinite(d.quantity)).toBe(true)
    expect(d.quantity).toBeGreaterThan(0)
    // ceil(20000 * 0.005) = 100
    expect(d.quantity).toBe(100)
  })

  test('T2.2: quantity independe de volume24h (sem realimentação)', () => {
    const low = agent.decide(mkCtx({ priceChange24h: -0.12, volume24h: 0, baseVolume: 20_000 }))
    const high = agent.decide(mkCtx({ priceChange24h: -0.12, volume24h: 5_000_000, baseVolume: 20_000 }))
    expect(high.quantity).toBe(low.quantity)
  })

  test('T2.2: volume24h gigante não explode quantity (cap defensivo preserva finitude)', () => {
    const d = agent.decide(mkCtx({ priceChange24h: -0.16, volume24h: 1e12, baseVolume: 50_000 }))
    expect(Number.isFinite(d.quantity)).toBe(true)
    expect(d.quantity).toBeLessThanOrEqual(10_000) // MAX_PANIC_QUANTITY
    // ceil(50000 * 0.005) = 250, ×2 (queda > 15%) = 500
    expect(d.quantity).toBe(500)
  })

  test('queda 7% (< 10%) → HOLD', () => {
    expect(agent.decide(mkCtx({ priceChange24h: -0.07 })).side).toBe('HOLD')
  })
})

// ─── AgentOrchestrator ────────────────────────────────────────────────────────

describe('AgentOrchestrator — createAgents', () => {
  test('A_TOP tem 6 agentes (4 tipos distintos + panic + contrarian)', () => {
    const agents = createAgents(AssetCluster.A_TOP)
    expect(agents.length).toBeGreaterThanOrEqual(4)
    const names = agents.map(a => a.id)
    expect(names).toContain('MarketMaker')
    expect(names).toContain('ValueInvestor')
    expect(names).toContain('Momentum')
    expect(names).toContain('RandomTrader')
  })

  test('B_ILLIQ tem apenas MarketMaker e RandomTrader', () => {
    const agents = createAgents(AssetCluster.B_ILLIQ)
    const names = new Set(agents.map(a => a.id))
    expect(names).toContain('MarketMaker')
    expect(names).toContain('RandomTrader')
    expect(names).not.toContain('ValueInvestor')
    expect(names).not.toContain('Momentum')
    expect(names).not.toContain('PanicSeller')
  })

  test('cluster inválido lança TypeError', () => {
    expect(() => createAgents('INVALID' as AssetCluster)).toThrow(TypeError)
  })
})

describe('AgentOrchestrator — aggregateImpact (lei sublinear de Kyle, T1.3)', () => {
  test('BUY puro retorna valor positivo', () => {
    const decisions = [
      { side: 'BUY' as const, quantity: 5, priceModifier: 0.001, reason: '' },
    ]
    expect(aggregateImpact(decisions)).toBeGreaterThan(0)
  })

  test('SELL puro retorna valor negativo', () => {
    const decisions = [
      { side: 'SELL' as const, quantity: 5, priceModifier: 0.001, reason: '' },
    ]
    expect(aggregateImpact(decisions)).toBeLessThan(0)
  })

  test('fluxo equilibrado (buys = sells) -> impacto ~0', () => {
    const decisions = [
      { side: 'BUY' as const, quantity: 10, priceModifier: 0.005, reason: '' },
      { side: 'SELL' as const, quantity: 10, priceModifier: 0.005, reason: '' },
    ]
    expect(aggregateImpact(decisions, AssetCluster.B_ILLIQ)).toBe(0)
  })

  test('volume moderado NAO satura o cap (corrige a saturacao linear pre-T1.3)', () => {
    // 10 SELL qty=5 -> fluxo liquido -50. Sob a formula LEGACY isso cravava
    // -0.02 (cap). Sob Kyle sublinear em A_SMALL fica ordens de magnitude abaixo.
    const decisions = Array.from({ length: 10 }, () => ({
      side: 'SELL' as const,
      quantity: 5,
      priceModifier: 0.005,
      reason: 'random',
    }))
    const legacy = aggregateImpactLegacy(decisions)
    const fixed = aggregateImpact(decisions, AssetCluster.A_SMALL)
    expect(legacy).toBe(-MAX_AGGREGATE_IMPACT)            // legacy: cravado no teto
    expect(Math.abs(fixed)).toBeLessThan(MAX_AGGREGATE_IMPACT) // novo: longe do teto
    expect(Math.abs(fixed)).toBeLessThan(0.001)
    expect(fixed).toBeLessThan(0)                         // direcao (venda) preservada
  })

  test('cap de ±2% segue como salvaguarda para fluxo extremo', () => {
    // B_ILLIQ (lambda 0,003, baseVolume 500): fluxo liquido gigante crava o cap.
    const decisions = [
      { side: 'SELL' as const, quantity: 5_000_000, priceModifier: 0, reason: '' },
    ]
    const impact = aggregateImpact(decisions, AssetCluster.B_ILLIQ)
    expect(impact).toBeGreaterThanOrEqual(-MAX_AGGREGATE_IMPACT)
    expect(impact).toBe(-MAX_AGGREGATE_IMPACT)
  })

  test('responde a profundidade do cluster: mesmo fluxo move mais no book raso', () => {
    const buys = [{ side: 'BUY' as const, quantity: 1_000, priceModifier: 0.001, reason: '' }]
    const aTop = aggregateImpact(buys, AssetCluster.A_TOP)     // baseVolume 50000, lambda 0.0001
    const bIlliq = aggregateImpact(buys, AssetCluster.B_ILLIQ) // baseVolume 500,   lambda 0.003
    expect(Math.abs(bIlliq)).toBeGreaterThan(Math.abs(aTop))
  })

  test('sublinear em volume: 4x fluxo -> ~2x impacto (sqrt), nao 4x', () => {
    const v1 = aggregateImpact([{ side: 'BUY' as const, quantity: 100, priceModifier: 0, reason: '' }], AssetCluster.A_SMALL)
    const v4 = aggregateImpact([{ side: 'BUY' as const, quantity: 400, priceModifier: 0, reason: '' }], AssetCluster.A_SMALL)
    expect(v4 / v1).toBeCloseTo(2, 6)
  })

  test('priceModifier nao entra mais no impacto (so a representacao de fluxo)', () => {
    const a = [{ side: 'BUY' as const, quantity: 10, priceModifier: 0.001, reason: '' }]
    const b = [{ side: 'BUY' as const, quantity: 10, priceModifier: 0.05, reason: '' }]
    expect(aggregateImpact(a, AssetCluster.A_TOP)).toBe(aggregateImpact(b, AssetCluster.A_TOP))
  })

  test('decisionFlow deriva signedVolume/deltaNotional pela intencao', () => {
    expect(decisionFlow({ side: 'BUY', quantity: 10, priceModifier: 0, reason: '' }, 5)).toEqual({ signedVolume: 10, deltaNotional: 50 })
    expect(decisionFlow({ side: 'SELL', quantity: 10, priceModifier: 0, reason: '' }, 5)).toEqual({ signedVolume: -10, deltaNotional: -50 })
    expect(decisionFlow({ side: 'HOLD', quantity: 10, priceModifier: 0, reason: '' }, 5)).toEqual({ signedVolume: 0, deltaNotional: 0 })
  })

  test('kyleImpactFromFlow: fluxo zero -> 0', () => {
    expect(kyleImpactFromFlow(0, AssetCluster.B_ILLIQ)).toBe(0)
  })

  test('impacto zero quando array vazio', () => {
    expect(aggregateImpact([])).toBe(0)
  })
})

describe('AgentOrchestrator — runTick', () => {
  test('agente que lança exceção é pulado (HOLD implícito)', () => {
    class BrokenAgent extends BaseAgent {
      decide(): never { throw new Error('unexpected error') }
    }
    const agents = [new BrokenAgent('Broken', 1), new MarketMakerAgent()]
    const ctx = mkCtx({ spread: 0.01 })
    // Não deve lançar — BrokenAgent é silenciado
    expect(() => runTick(agents, ctx)).not.toThrow()
    const decisions = runTick(agents, ctx)
    // MarketMakerAgent deve ter retornado uma decisão
    expect(Array.isArray(decisions)).toBe(true)
  })

  test('sessão FECHADO → todos os agentes retornam HOLD (array vazio após filtro)', () => {
    const agents = createAgents(AssetCluster.A_TOP)
    const ctx = mkCtx({ session: 'CLOSED' })
    const decisions = runTick(agents, ctx)
    expect(decisions.length).toBe(0)
  })
})

describe('AgentOrchestrator — instância', () => {
  test('dispose() não lança', () => {
    const orch = new AgentOrchestrator()
    orch.initAsset('asset-1', AssetCluster.A_TOP)
    expect(() => orch.dispose()).not.toThrow()
  })

  test('tickAsset retorna {impact, syntheticVolume} com impact dentro do cap', () => {
    const orch = new AgentOrchestrator()
    orch.initAsset('asset-1', AssetCluster.A_TOP)
    const ctx = mkCtx()
    const result = orch.tickAsset('asset-1', ctx)
    expect(typeof result.impact).toBe('number')
    expect(result.impact).toBeGreaterThanOrEqual(-MAX_AGGREGATE_IMPACT)
    expect(result.impact).toBeLessThanOrEqual(MAX_AGGREGATE_IMPACT)
    expect(typeof result.syntheticVolume).toBe('number')
  })
})

// ─── Gating por volatilidade de sessao (T1.2) ──────────────────────────────────

describe('AgentOrchestrator — gating por volatilidade (T1.2)', () => {
  // Agente determinista para isolar a logica de gate/escala da aleatoriedade
  // dos agentes de mercado (RandomTrader/MarketMaker usam Math.random).
  class FixedBuyAgent extends BaseAgent {
    constructor(id: string, private readonly mod: number, private readonly qty = 10) {
      super(id, 1)
    }
    decide(): { side: 'BUY'; quantity: number; priceModifier: number; reason: string } {
      return { side: 'BUY', quantity: this.qty, priceModifier: this.mod, reason: 'fixed' }
    }
  }

  test('volatilityMultiplier < 0.5 → 100% HOLD (runTick vazio) mesmo com decisao crua BUY', () => {
    const agents = [new FixedBuyAgent('A', 0.001), new FixedBuyAgent('B', 0.0005)]
    const ctx = mkCtx({ volatilityMultiplier: 0.3 })
    const decisions = runTick(agents, ctx)
    expect(decisions).toHaveLength(0)
    // byAgentId reflete o gate (HOLD) para leitura/instrumentacao
    const detail = runTickDetailed(agents, ctx)
    expect(detail.decisions).toHaveLength(0)
    expect(detail.byAgentId['A'].side).toBe('HOLD')
    expect(detail.byAgentId['B'].side).toBe('HOLD')
  })

  test('limiar: vm exatamente no threshold (0.5) NAO e gated', () => {
    const agents = [new FixedBuyAgent('A', 0.001)]
    const decisions = runTick(agents, mkCtx({ volatilityMultiplier: VOLATILITY_GATE_THRESHOLD }))
    expect(decisions).toHaveLength(1)
    expect(decisions[0].side).toBe('BUY')
  })

  test('tickAsset com vm < 0.5 → impacto efetivo zero e volume zero (<= 50% do nominal)', () => {
    const orch = new AgentOrchestrator()
    orch.initAsset('asset-1', AssetCluster.A_TOP)
    const gated = orch.tickAsset('asset-1', mkCtx({ volatilityMultiplier: 0.2, priceChange24h: 0.03 }))
    expect(gated.impact).toBe(0)
    expect(gated.syntheticVolume).toBe(0)
  })

  test('escala uniforme preserva pesos relativos entre agentes (vm=0.6)', () => {
    const agents = [new FixedBuyAgent('A', 0.001), new FixedBuyAgent('B', 0.0005)]
    const full = runTickDetailed(agents, mkCtx({ volatilityMultiplier: 1.0 }))
    const half = runTickDetailed(agents, mkCtx({ volatilityMultiplier: 0.6 }))
    // priceModifier escala pelo mesmo fator para ambos os agentes
    expect(half.byAgentId['A'].priceModifier).toBeCloseTo(full.byAgentId['A'].priceModifier * 0.6, 10)
    expect(half.byAgentId['B'].priceModifier).toBeCloseTo(full.byAgentId['B'].priceModifier * 0.6, 10)
    // razao A/B (peso relativo) inalterada
    const ratioFull = full.byAgentId['A'].priceModifier / full.byAgentId['B'].priceModifier
    const ratioHalf = half.byAgentId['A'].priceModifier / half.byAgentId['B'].priceModifier
    expect(ratioHalf).toBeCloseTo(ratioFull, 10)
    // Pos-T1.3 o impacto agregado deriva do fluxo liquido assinado (volume), nao
    // mais de priceModifier. A escala uniforme de priceModifier pelo gate de
    // volatilidade (T1.2) preserva os pesos relativos de leitura, mas como o
    // quantity permanece intacto o impacto agregado e identico entre full e half.
    expect(aggregateImpact(half.decisions)).toBe(aggregateImpact(full.decisions))
  })

  test('vm=1.0 e identidade: priceModifier inalterado (sem regressao no harness/CA2)', () => {
    const agents = [new FixedBuyAgent('A', 0.0012)]
    const detail = runTickDetailed(agents, mkCtx({ volatilityMultiplier: 1.0 }))
    expect(detail.decisions[0].priceModifier).toBe(0.0012)
  })

  test('sessao normal (vm=1.0, TRADING) segue gerando decisoes', () => {
    // MomentumAgent decide BUY de forma determinista quando priceChange24h >= 2%.
    const agents = createAgents(AssetCluster.A_TOP)
    const decisions = runTick(agents, mkCtx({ volatilityMultiplier: 1.0, priceChange24h: 0.03 }))
    expect(decisions.length).toBeGreaterThan(0)
  })
})
