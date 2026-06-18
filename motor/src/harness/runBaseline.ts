// ============================================================================
// FootStock Motor — Harness de medicao (Item 003 / loop 06-17)
//
// CLI `npm run ab:local`: roda a simulacao deterministica, computa CA1..CA6 e
// grava o BASELINE GOLDEN pre-fix em src/harness/baseline/golden-baseline.json.
//
// O golden e DETERMINISTICO (mesma seed -> bytes identicos): contem so fixtures
// + predicados. O custo aproximado e deterministico (contagem de operacoes); o
// tempo de parede (wall-clock) e apenas IMPRESSO, nunca gravado.
//
// Uso A/B: rodar antes do fix (baseline) e depois (novo golden) e comparar os
// predicados CA1..CA6. As tasks de fix (004+) regeram este arquivo.
// ============================================================================

import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { installSeededRandom } from './prng'
import { runHarness } from './runHarness'
import {
  ASSET_FIXTURES,
  DEFAULT_SEED,
  DEFAULT_TICKS_PER_ASSET,
  PRODUCTION_AGENT_COUNTS,
  PRODUCTION_DT_SECONDS_DEFAULT,
  PRODUCTION_TICK_INTERVAL_SECONDS,
  SESSION_TYPE,
  SESSION_VOLATILITY_MULTIPLIER,
} from './fixtures'
import type { HarnessResult } from './runHarness'

export const BASELINE_DIR = join(__dirname, 'baseline')
export const BASELINE_FILE = join(BASELINE_DIR, 'golden-baseline.json')

export const BASELINE_SCHEMA_VERSION = '1.0.0'

export interface GoldenBaseline {
  schemaVersion: string
  generator: string
  purpose: string
  seed: number
  fixtures: {
    tickIntervalSeconds: number
    dtSeconds: number
    agentCounts: string
    sessionType: string
    sessionVolatilityMultiplier: number
    ticksPerAsset: number
    balancedBook: boolean
    assets: { ticker: string; cluster: string }[]
  }
  predicates: HarnessResult['perAsset']
  approxCost: {
    assets: number
    ticksPerAsset: number
    totalAssetTicks: number
    estimatedLayerInvocations: number
  }
}

/** Roda o harness com seed fixa e monta o objeto golden (deterministico). */
export function buildGoldenBaseline(
  seed = DEFAULT_SEED,
  ticksPerAsset = DEFAULT_TICKS_PER_ASSET,
): GoldenBaseline {
  const handle = installSeededRandom(seed)
  // T3.3: o golden e a REFERENCIA PRE-FIX e DEVE rodar com dt=1.0 (o "default
  // acidental" diagnosticado como Bug 1 — ruido inflado na abertura). Como as
  // camadas agora resolvem o dt EXPLICITAMENTE (getTickDt, default-safe legacy
  // 5/390), fixamos MOTOR_TICK_DT_SECONDS='1' so durante a geracao do golden para
  // preservar os predicados byte-a-byte (fixtures.dtSeconds ja documenta 1.0).
  const prevDt = process.env.MOTOR_TICK_DT_SECONDS
  process.env.MOTOR_TICK_DT_SECONDS = String(PRODUCTION_DT_SECONDS_DEFAULT)
  let result: HarnessResult
  try {
    // O golden e a REFERENCIA PRE-FIX: roda com TODOS os toggles legacy ligados para
    // preservar o sintoma diagnosticado (MarketMaker saturando o cap em todo tick,
    // CA2/CA3 ~1, MM_pctActive ~1, serrilhado ~2%/tick). As tasks de fix (004+) comparam
    // o harness corrigido (default) contra este baseline. Item T1.1 corrige a unidade do
    // spread; Item T1.3 troca a formula de impacto linear (saturante) pela lei sublinear
    // de Kyle; Item T1.4 traz o impacto para DENTRO do PriceCalculator (legacyAgentApplication
    // reproduz a aplicacao externa pre-fix, que escapava do cap de velocidade e do CB). Os
    // Item T2.2 desacopla a quantity dos agentes de state.volume (legacyAgentQuantity
    // realimenta state.volume como baseVolume aqui, reproduzindo o feedback loop pre-fix).
    // Os quatro toggles ficam ligados aqui para que o golden continue reproduzindo o estado
    // pre-fix byte-a-byte (mesma seed -> mesmo golden).
    result = runHarness({
      ticksPerAsset,
      assets: ASSET_FIXTURES,
      legacySpreadUnit: true,
      legacyImpactFormula: true,
      legacyAgentApplication: true,
      legacyAgentQuantity: true,
    })
  } finally {
    handle.restore()
    if (prevDt === undefined) delete process.env.MOTOR_TICK_DT_SECONDS
    else process.env.MOTOR_TICK_DT_SECONDS = prevDt
  }

  const assets = ASSET_FIXTURES.length
  const totalAssetTicks = assets * ticksPerAsset
  // ~11 invocacoes de camada por tick de ativo (L1-L10 + Corr): proxy de custo
  // deterministico (independente de wall-clock).
  const estimatedLayerInvocations = totalAssetTicks * 11

  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    generator: 'src/harness/runBaseline.ts',
    purpose:
      'Baseline GOLDEN pre-fix do motor FootStock (loop 06-17, Item 003). ' +
      'Reproduz o serrilhado ~2%/tick diagnosticado (agentes cravando o cap +-2%).',
    seed,
    fixtures: {
      tickIntervalSeconds: PRODUCTION_TICK_INTERVAL_SECONDS,
      dtSeconds: PRODUCTION_DT_SECONDS_DEFAULT,
      agentCounts: PRODUCTION_AGENT_COUNTS,
      sessionType: SESSION_TYPE,
      sessionVolatilityMultiplier: SESSION_VOLATILITY_MULTIPLIER,
      ticksPerAsset,
      balancedBook: true,
      assets: ASSET_FIXTURES.map((a) => ({ ticker: a.ticker, cluster: a.cluster })),
    },
    predicates: result.perAsset,
    approxCost: {
      assets,
      ticksPerAsset,
      totalAssetTicks,
      estimatedLayerInvocations,
    },
  }
}

/** Serializa o golden de forma estavel (chaves na ordem de insercao, indent 2). */
export function serializeGolden(golden: GoldenBaseline): string {
  return JSON.stringify(golden, null, 2) + '\n'
}

function main(): void {
  const startedMs = Date.now()
  const golden = buildGoldenBaseline()
  const elapsedMs = Date.now() - startedMs

  mkdirSync(BASELINE_DIR, { recursive: true })
  writeFileSync(BASELINE_FILE, serializeGolden(golden), 'utf8')

  // Resumo legivel (stdout). Wall-clock NAO entra no golden.
  process.stdout.write('=== ab:local — baseline golden gravado ===\n')
  process.stdout.write(`arquivo: ${BASELINE_FILE}\n`)
  process.stdout.write(`seed: ${golden.seed} | ticks/ativo: ${golden.fixtures.ticksPerAsset}\n`)
  for (const [ticker, p] of Object.entries(golden.predicates)) {
    process.stdout.write(
      `[${ticker}] CA1 p95=${(p.CA1_absReturn.p95 * 100).toFixed(3)}% ` +
        `p99=${(p.CA1_absReturn.p99 * 100).toFixed(3)}% | ` +
        `CA2 >0.35%=${(p.CA2_pctAbove0_35 * 100).toFixed(1)}% | ` +
        `CA3 saturado=${(p.CA3_pctAgentSaturated * 100).toFixed(1)}% | ` +
        `CA6 morto=${(p.CA6_pctDeadMarket * 100).toFixed(1)}% | ` +
        `NaN/Inf=${p.nonFiniteCount}\n`,
    )
  }
  process.stdout.write(`custo (wall-clock, nao-gravado): ${elapsedMs}ms\n`)
}

if (require.main === module) {
  main()
}
