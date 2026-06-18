// ============================================================================
// FootStock Motor — Harness de medicao (Item 003 / loop 06-17)
// Testes: determinismo + reproducao do sintoma + integridade do golden.
// ============================================================================

import { existsSync, readFileSync } from 'fs'
import { buildGoldenBaseline, serializeGolden, BASELINE_FILE, BASELINE_SCHEMA_VERSION } from '../runBaseline'
import type { GoldenBaseline } from '../runBaseline'
import { installSeededRandom, mulberry32 } from '../prng'
import { runHarness } from '../runHarness'
import { DEFAULT_SEED, buildInitialState, ASSET_FIXTURES } from '../fixtures'
import { resolveTickDt } from '../../engine/tick-dt'
import { L1_OrnsteinUhlenbeck } from '../../engine/layers/L1_OrnsteinUhlenbeck'
import { getClusterParams } from '../../microstructure/clusters'

// Tick count reduzido para os testes de logica/determinismo (rapido). O teste
// de reproducao do golden usa a contagem REAL gravada no arquivo.
const FAST_TICKS = 600

// T3.3: as comparacoes pre/pos-fix (sintoma, T1.1, T1.3, T1.4, T2.4) reproduzem o
// estado DIAGNOSTICADO, que ocorreu no dt acidental 1.0 (mesmo dt do golden). Como
// as camadas agora resolvem o dt explicitamente (default-safe legacy 5/390), estas
// runs fixam MOTOR_TICK_DT_SECONDS='1' para isolar cada fix da escala temporal e
// continuar comparando contra a referencia pre-fix. O describe "Item T3.3" abaixo e
// quem valida o default-safe explicitamente (env ausente). Restaura o env ao fim.
function runHarnessRefDt(opts: Parameters<typeof runHarness>[0], seed = DEFAULT_SEED) {
  const prev = process.env.MOTOR_TICK_DT_SECONDS
  process.env.MOTOR_TICK_DT_SECONDS = '1'
  const h = installSeededRandom(seed)
  try {
    return runHarness(opts)
  } finally {
    h.restore()
    if (prev === undefined) delete process.env.MOTOR_TICK_DT_SECONDS
    else process.env.MOTOR_TICK_DT_SECONDS = prev
  }
}

describe('prng (mulberry32 + Math.random override)', () => {
  it('e deterministico para a mesma seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 10 }, () => a())
    const seqB = Array.from({ length: 10 }, () => b())
    expect(seqA).toEqual(seqB)
  })

  it('difere entre seeds e restaura Math.random', () => {
    const original = Math.random
    const handle = installSeededRandom(7)
    expect(Math.random).not.toBe(original)
    const first = Math.random()
    handle.restore()
    expect(Math.random).toBe(original)
    handle.restore() // idempotente
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(1)
  })
})

describe('runHarness determinismo', () => {
  it('duas execucoes com a mesma seed produzem predicados identicos', () => {
    const run = () => {
      const h = installSeededRandom(DEFAULT_SEED)
      try {
        return runHarness({ ticksPerAsset: FAST_TICKS })
      } finally {
        h.restore()
      }
    }
    const r1 = run()
    const r2 = run()
    expect(r2.perAsset).toEqual(r1.perAsset)
  })

  it('seeds diferentes produzem predicados diferentes (RNG realmente injetado)', () => {
    const run = (seed: number) => {
      const h = installSeededRandom(seed)
      try {
        return runHarness({ ticksPerAsset: FAST_TICKS })
      } finally {
        h.restore()
      }
    }
    const a = run(1)
    const b = run(2)
    // Pelo menos um predicado deve divergir entre seeds distintas.
    expect(b.perAsset).not.toEqual(a.perAsset)
  })
})

describe('reproducao do sintoma diagnosticado (serrilhado ~2%/tick)', () => {
  // O sintoma e PRE-FIX: depende do bug de unidade do spread (Item T1.1), da formula de
  // impacto linear saturante (Item T1.3) E da aplicacao externa do impacto (Item T1.4,
  // que escapava do cap de velocidade). Apos os fixes o caminho default nao reproduz mais
  // o serrilhado no A_TOP, entao a reproducao do sintoma liga TODOS os toggles legacy
  // (mesma referencia do golden).
  const result: ReturnType<typeof runHarness> = runHarnessRefDt({ ticksPerAsset: FAST_TICKS, legacySpreadUnit: true, legacyImpactFormula: true, legacyAgentApplication: true })

  it('A_TOP (URU3): p95 de |ret| perto de ~2% (agentes cravando o cap)', () => {
    const p = result.perAsset['URU3']
    // Diagnostico: mediana ~2,15%, 100% dos ticks no limite. p95 deve ficar >1,5%.
    expect(p.CA1_absReturn.p95).toBeGreaterThan(0.015)
  })

  it('CA2: quase todos os ticks excedem 0,35% (trava de velocidade furada)', () => {
    expect(result.perAsset['URU3'].CA2_pctAbove0_35).toBeGreaterThan(0.9)
  })

  it('CA3: impacto de agente saturado (>=1,9%) na vasta maioria dos ticks', () => {
    expect(result.perAsset['URU3'].CA3_pctAgentSaturated).toBeGreaterThan(0.9)
  })

  it('CA1: contagem de NaN/Infinity e zero em todos os ativos', () => {
    for (const p of Object.values(result.perAsset)) {
      expect(p.nonFiniteCount).toBe(0)
    }
  })

  it('cobre >= 2 ativos e a contagem de ticks pedida', () => {
    expect(Object.keys(result.perAsset).length).toBeGreaterThanOrEqual(2)
    expect(result.ticksPerAsset).toBe(FAST_TICKS)
    for (const p of Object.values(result.perAsset)) {
      expect(p.totalTicks).toBe(FAST_TICKS)
    }
  })
})

describe('Item T1.1 — MarketMaker so age com spread fracional real', () => {
  // Tick count moderado: MM_pctActive e uma fracao estavel, nao precisa dos 8640.
  const FIX_TICKS = 1_200
  const runMode = (legacy: boolean) =>
    // O estado pre-fix liga TODOS os toggles legacy (spread + impacto + aplicacao
    // externa): a comparacao T1.1 mede o caminho totalmente corrigido contra o
    // totalmente legado, evitando misturar correcoes novas no lado "antes".
    // dt de referencia (1.0) fixado em runHarnessRefDt (T3.3).
    runHarnessRefDt({ ticksPerAsset: FIX_TICKS, legacySpreadUnit: legacy, legacyImpactFormula: legacy, legacyAgentApplication: legacy })
  const legacy = runMode(true) // pre-fix: ctx.spread ABSOLUTO (newPrice*0.002) + impacto linear
  const fixed = runMode(false) // pos-fix: ctx.spread FRACIONAL (params.spread) + Kyle sublinear

  it('VERMELHO antes: MM dispara em quase todo tick no book estreito (A_TOP/URU3)', () => {
    // URU3 = A_TOP, spread base 0,05% (estreito). Sob o bug de unidade o MM ignora
    // a largura real do book (compara absoluto vs alvo fracional) e dispara sempre.
    expect(legacy.perAsset['URU3'].MM_pctActive).toBeGreaterThan(0.9)
  })

  it('VERDE depois: % de ticks com MM ativo cai >= 60% no book estreito', () => {
    const before = legacy.perAsset['URU3'].MM_pctActive
    const after = fixed.perAsset['URU3'].MM_pctActive
    expect(before).toBeGreaterThan(0)
    // Queda relativa >= 60% (na pratica ~100%: 0,05% < TARGET_SPREAD 0,1% -> HOLD).
    expect((before - after) / before).toBeGreaterThanOrEqual(0.6)
  })

  it('MM AINDA dispara em book largo (B_ILLIQ/ABT3, spread 1,5%) apos o fix', () => {
    // ABT3 = B_ILLIQ, spread base 1,5% >> TARGET_SPREAD 0,1% -> MM segue fornecendo
    // liquidez. O fix so silencia o MM onde o book ja esta apertado.
    expect(fixed.perAsset['ABT3'].MM_pctActive).toBeGreaterThan(0.6)
  })

  it('CA2 melhora no A_TOP apos o fix (MM nao satura mais o cap +-2%)', () => {
    expect(fixed.perAsset['URU3'].CA2_pctAbove0_35).toBeLessThan(
      legacy.perAsset['URU3'].CA2_pctAbove0_35,
    )
  })

  it('vs baseline golden (pre-fix): MM_pctActive do fix cai >= 60% no A_TOP', () => {
    const golden = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as GoldenBaseline
    const before = golden.predicates['URU3'].MM_pctActive
    const after = fixed.perAsset['URU3'].MM_pctActive
    expect(before).toBeGreaterThan(0)
    expect((before - after) / before).toBeGreaterThanOrEqual(0.6)
  })
})

describe('Item T1.3 — impacto sublinear de Kyle (sem saturacao no cap)', () => {
  const FIX_TICKS = 1_200
  const runMode = (legacy: boolean) =>
    // dt de referencia (1.0) fixado em runHarnessRefDt (T3.3).
    runHarnessRefDt({ ticksPerAsset: FIX_TICKS, legacySpreadUnit: legacy, legacyImpactFormula: legacy, legacyAgentApplication: legacy })
  const legacy = runMode(true) // pre-fix: impacto = sign*|priceModifier|*quantity (satura)
  const fixed = runMode(false) // pos-fix: impacto = sign*lambdaKyle*sqrt(|V|/baseVolume)

  it('VERMELHO antes: impacto saturado no cap em quase todo tick (A_TOP/URU3)', () => {
    expect(legacy.perAsset['URU3'].CA3_pctAgentSaturated).toBeGreaterThan(0.9)
  })

  it('VERDE depois: saturacao do impacto <= 0,1% dos ticks no A_TOP (URU3)', () => {
    expect(fixed.perAsset['URU3'].CA3_pctAgentSaturated).toBeLessThanOrEqual(0.001)
  })

  it('VERDE depois: saturacao do impacto <= 0,1% dos ticks no B_ILLIQ (ABT3)', () => {
    // Mesmo no cluster raso (lambdaKyle 0,003, baseVolume 500) o fluxo liquido
    // sublinear nao crava o teto +-2%.
    expect(fixed.perAsset['ABT3'].CA3_pctAgentSaturated).toBeLessThanOrEqual(0.001)
  })

  it('VERDE depois: |ret| do A_TOP cai drasticamente (sem serrilhado ~2%)', () => {
    // Sob a formula nova o p95 de |ret| no A_TOP fica << 2% (book profundo).
    expect(fixed.perAsset['URU3'].CA1_absReturn.p95).toBeLessThan(
      legacy.perAsset['URU3'].CA1_absReturn.p95,
    )
  })

  it('finitude preservada (sem NaN/Infinity) com a formula nova', () => {
    for (const p of Object.values(fixed.perAsset)) {
      expect(p.nonFiniteCount).toBe(0)
    }
  })
})

describe('Item T1.4 — impacto do agente dentro do PriceCalculator (cap + CB)', () => {
  const FIX_TICKS = 4_000
  // dt de referencia (1.0) fixado em runHarnessRefDt (T3.3).
  const run = (opts: Parameters<typeof runHarness>[0]) =>
    runHarnessRefDt({ ticksPerAsset: FIX_TICKS, ...opts })
  // Baseline pre-fix: impacto aplicado POR FORA (legacyAgentApplication), escapando do
  // cap de velocidade e do circuit breaker. Os outros toggles legacy ligados para a
  // comparacao bater com o estado de referencia do golden.
  const baseline = run({ legacySpreadUnit: true, legacyImpactFormula: true, legacyAgentApplication: true })
  // Corrigido (default): impacto INJETADO no calculate (antes de L8/correlacao/freio/L10).
  const fixed = run({})

  it('CA6: halts indevidos do caminho corrigido NAO sobem acima do baseline pre-fix', () => {
    // Aceite T1.4: trazer o impacto para dentro do cap/CB nao pode AUMENTAR os halts
    // (o cap so reduz a magnitude do movimento por tick). No book equilibrado do harness
    // nenhum modo dispara o CB (oscilacao nao acumula ate a banda de 8%), entao a
    // propriedade vale como 0 <= 0 — e o teste pega regressao se a injecao do agente
    // passar a disparar halts espurios acima do baseline.
    for (const ticker of Object.keys(fixed.haltsByAsset)) {
      expect(fixed.haltsByAsset[ticker]).toBeLessThanOrEqual(baseline.haltsByAsset[ticker])
    }
  })

  it('a injecao do impacto NAO introduz halts espurios (0 no caminho corrigido)', () => {
    for (const halts of Object.values(fixed.haltsByAsset)) {
      expect(halts).toBe(0)
    }
  })

  it('CA2 do caminho corrigido <= baseline: nenhuma fonte de preco escapa do cap de 0,35%', () => {
    // Sob a aplicacao externa pre-fix o impacto somava +-2% APOS o cap, estourando 0,35%
    // em quase todo tick (A_TOP). Com o impacto dentro do cap, a fracao de ticks acima de
    // 0,35% nao pode subir vs o baseline — o agente deixou de furar a trava de velocidade.
    expect(fixed.perAsset['URU3'].CA2_pctAbove0_35).toBeLessThanOrEqual(
      baseline.perAsset['URU3'].CA2_pctAbove0_35,
    )
  })

  it('finitude preservada (sem NaN/Infinity) com o impacto dentro do calculate', () => {
    for (const p of Object.values(fixed.perAsset)) {
      expect(p.nonFiniteCount).toBe(0)
    }
  })
})

describe('Item T2.4 — L5 (Kyle) usa fluxo líquido: book equilibrado -> impacto ~0', () => {
  // O harness roda com book equilibrado (pendingBuy == pendingSell == 0 a cada tick),
  // logo o fluxo líquido abs(buy-sell) é 0 e o L5 não injeta impacto. Aceite T2.4:
  // CA5_l5MeanImpact (média e média-abs do deltaPrice do L5) fica dentro de ±0,05%/tick
  // (na prática 0). CA3 (saturação de agente) permanece baixo — sem regressão.
  const FIX_TICKS = 1_200
  const h = installSeededRandom(DEFAULT_SEED)
  let result: ReturnType<typeof runHarness>
  try {
    result = runHarness({ ticksPerAsset: FIX_TICKS })
  } finally {
    h.restore()
  }

  it('CA5: impacto médio do L5 dentro de ±0,05%/tick em todos os ativos (book equilibrado)', () => {
    for (const p of Object.values(result.perAsset)) {
      expect(Math.abs(p.CA5_l5MeanImpact.mean)).toBeLessThan(0.0005)
      expect(p.CA5_l5MeanImpact.meanAbs).toBeLessThan(0.0005)
    }
  })

  it('CA5: sem execução direcional o impacto do L5 é exatamente 0 (média-abs == 0)', () => {
    for (const p of Object.values(result.perAsset)) {
      expect(p.CA5_l5MeanImpact.meanAbs).toBe(0)
    }
  })

  it('CA3 local confirmado: agente não satura no caminho corrigido (sem regressão)', () => {
    for (const p of Object.values(result.perAsset)) {
      expect(p.CA3_pctAgentSaturated).toBeLessThanOrEqual(0.001)
      expect(p.nonFiniteCount).toBe(0)
    }
  })
})

describe('baseline golden', () => {
  it('o arquivo golden existe (gerado por `npm run ab:local`)', () => {
    expect(existsSync(BASELINE_FILE)).toBe(true)
  })

  it('o golden e bem-formado e tem o shape esperado', () => {
    const golden = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as GoldenBaseline
    expect(golden.schemaVersion).toBe(BASELINE_SCHEMA_VERSION)
    expect(golden.fixtures.tickIntervalSeconds).toBe(10)
    expect(golden.fixtures.dtSeconds).toBe(1.0)
    expect(golden.fixtures.ticksPerAsset).toBeGreaterThanOrEqual(8640)
    expect(golden.fixtures.assets.length).toBeGreaterThanOrEqual(2)
    expect(Object.keys(golden.predicates).length).toBeGreaterThanOrEqual(2)
  })

  it('reproduz exatamente os predicados gravados (mesma seed -> mesmo golden)', () => {
    const golden = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as GoldenBaseline
    const fresh = buildGoldenBaseline(golden.seed, golden.fixtures.ticksPerAsset)
    expect(fresh.predicates).toEqual(golden.predicates)
    // Serializacao tambem deve bater byte-a-byte (golden e deterministico).
    expect(serializeGolden(fresh)).toBe(serializeGolden(golden))
  })

  it('o golden reproduz o sintoma (CA2/CA3 altos no A_TOP)', () => {
    const golden = JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as GoldenBaseline
    const top = golden.predicates['URU3']
    expect(top.CA2_pctAbove0_35).toBeGreaterThan(0.9)
    expect(top.CA3_pctAgentSaturated).toBeGreaterThan(0.9)
  })
})

// ============================================================================
// Item T3.3 — escala temporal (DT) EXPLÍCITA e auditável (loop 06-17 / Item 014)
// Aceite: o motor lê um DT explícito (não 1.0 acidental) e o harness mostra a
// volatilidade intraday DENTRO do gate local (|ret| sob o cap de 0,35%/tick, CA4
// ofi decaído) SEM mercado morto (preços se movem; o dt legacy não congela o
// mercado mais que o passo unitário). Roda o caminho corrigido (default).
// ============================================================================
describe('Item T3.3 — DT explícito: volatilidade intraday no gate, sem mercado morto', () => {
  const FIX_TICKS = 4_000
  const VELOCITY_CAP = 0.0035 // 0,35%/tick (L8) — teto do gate de volatilidade intraday

  const runAtDt = (dt: string | undefined) => {
    const prev = process.env.MOTOR_TICK_DT_SECONDS
    if (dt === undefined) delete process.env.MOTOR_TICK_DT_SECONDS
    else process.env.MOTOR_TICK_DT_SECONDS = dt
    const h = installSeededRandom(DEFAULT_SEED)
    try {
      return runHarness({ ticksPerAsset: FIX_TICKS })
    } finally {
      h.restore()
      if (prev === undefined) delete process.env.MOTOR_TICK_DT_SECONDS
      else process.env.MOTOR_TICK_DT_SECONDS = prev
    }
  }

  // default-safe legacy (env ausente => 5/390) vs recalibração formal (DT=1).
  const dflt = runAtDt(undefined)
  const unit = runAtDt('1')

  it('o motor lê um DT EXPLÍCITO default-safe legacy (5/390), não o 1.0 acidental', () => {
    // Resolução central explícita.
    expect(resolveTickDt({})).toEqual({ value: 5 / 390, source: 'legacy-default-safe' })
    // E a camada real (L1) propaga esse dt explícito no metadata quando o env está ausente.
    const prev = process.env.MOTOR_TICK_DT_SECONDS
    delete process.env.MOTOR_TICK_DT_SECONDS
    try {
      const fx = ASSET_FIXTURES[0]
      const result = new L1_OrnsteinUhlenbeck().applyLayer(
        buildInitialState(fx),
        getClusterParams(fx.cluster),
        1.0,
      )
      expect(Number(result.metadata?.dt)).toBeCloseTo(5 / 390, 12)
      expect(Number(result.metadata?.dt)).not.toBe(1)
    } finally {
      if (prev === undefined) delete process.env.MOTOR_TICK_DT_SECONDS
      else process.env.MOTOR_TICK_DT_SECONDS = prev
    }
  })

  it('sem NaN/Infinity em nenhum ativo no DT default', () => {
    for (const p of Object.values(dflt.perAsset)) {
      expect(p.nonFiniteCount).toBe(0)
    }
  })

  it('volatilidade intraday DENTRO do gate: |ret| p99 sob o cap de 0,35%/tick', () => {
    for (const p of Object.values(dflt.perAsset)) {
      expect(p.CA1_absReturn.p99).toBeLessThanOrEqual(VELOCITY_CAP)
      expect(p.CA1_absReturn.max).toBeLessThanOrEqual(VELOCITY_CAP + 1e-9)
    }
  })

  it('mercado VIVO: cada ativo se move em algum tick e nenhum congela 100%', () => {
    for (const p of Object.values(dflt.perAsset)) {
      expect(p.CA1_absReturn.max).toBeGreaterThan(0) // há movimento
      expect(p.CA6_pctDeadMarket).toBeLessThan(1) // não 100% morto
    }
  })

  it('CA4: ofiState decai a ~0 em book equilibrado (gate local satisfeito)', () => {
    for (const p of Object.values(dflt.perAsset)) {
      expect(Math.abs(p.CA4_ofiDecay.final)).toBeLessThan(1e-6)
      expect(p.CA4_ofiDecay.maxAbs).toBeLessThan(1e-6)
    }
  })

  it('sem mercado morto por dt pequeno: o DT legacy não congela mais que o passo unitário', () => {
    // Falha esperada se alguém escolher um dt minúsculo que mate a liquidez: aqui o
    // default-safe legacy (5/390) NÃO pode deixar nenhum ativo mais morto que DT=1.
    for (const ticker of Object.keys(dflt.perAsset)) {
      expect(dflt.perAsset[ticker].CA6_pctDeadMarket).toBeLessThanOrEqual(
        unit.perAsset[ticker].CA6_pctDeadMarket + 0.02,
      )
    }
  })
})
