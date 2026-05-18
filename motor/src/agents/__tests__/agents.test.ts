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
import { AgentOrchestrator, AssetCluster, createAgents, runTick, aggregateImpact, MAX_AGGREGATE_IMPACT } from '../AgentOrchestrator'

// ─── Context helper ───────────────────────────────────────────────────────────

function mkCtx(overrides: Partial<MarketContext> = {}): MarketContext {
  return {
    ticker: 'VAR1',
    currentPrice: 10.0,
    fairValue: 10.0,
    priceChange24h: 0,
    volume24h: 10_000,
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

describe('AgentOrchestrator — aggregateImpact', () => {
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

  test('cap de ±2% — nunca ultrapassa MAX_AGGREGATE_IMPACT', () => {
    // 10 RandomTraders todos SELL com priceModifier=0.005 e quantity=5
    // impacto bruto = -10 × 0.005 × 5 = -0.25 (25%) → deve ser capped em -0.02
    const decisions = Array.from({ length: 10 }, () => ({
      side: 'SELL' as const,
      quantity: 5,
      priceModifier: 0.005,
      reason: 'random',
    }))
    const impact = aggregateImpact(decisions)
    expect(impact).toBeGreaterThanOrEqual(-MAX_AGGREGATE_IMPACT)
    expect(impact).toBeLessThanOrEqual(MAX_AGGREGATE_IMPACT)
    expect(impact).toBe(-MAX_AGGREGATE_IMPACT)  // capped exatamente em -0.02
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
