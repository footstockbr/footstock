import { PrismaClient, Prisma } from '@prisma/client'

const prisma = new PrismaClient()

const dryRun = !process.argv.includes('--write')
const force = process.argv.includes('--force')

function argValue(name: string, fallback: number): number {
  const index = process.argv.indexOf(name)
  if (index < 0) return fallback
  const parsed = Number.parseInt(process.argv[index + 1] ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const batchSize = argValue('--batch-size', 500)
const limit = argValue('--limit', Number.POSITIVE_INFINITY)

if (force && process.env.NODE_ENV === 'production') {
  throw new Error('Backfill --force proibido em producao.')
}

type Candidate = {
  id: string
  source: string
  timestamp: Date
  open: Prisma.Decimal
  close: Prisma.Decimal
  volume: bigint
  sessionType: string
  attribution: Prisma.JsonValue | null
}

type BackfillDecision =
  | { action: 'write'; attribution: Record<string, unknown> }
  | { action: 'skip'; reason: string }

// Politica de backfill honesto:
// - GBM: atribuicao sintetica explicita (SYNTHETIC_HISTORY + LEGACY_BACKFILL), sem fingir causa real.
// - REAL/legado sem rastro de motor: marca LEGACY_BACKFILL "historico legado sem rastro causal".
// - MOTOR: NUNCA reconstruir; um candle do motor sem atribuicao e defeito operacional que
//   deve continuar visivel (a aba reporta owner ENGINE). Backfill so o esconderia.
function decide(item: Candidate): BackfillDecision {
  if (item.source === 'MOTOR') {
    return { action: 'skip', reason: 'MOTOR_NEEDS_ENGINE_INVESTIGATION' }
  }

  const previousPrice = Number(item.open)
  const finalPrice = Number(item.close)
  const generatedAt = item.timestamp.toISOString()
  const isGbm = item.source === 'GBM'
  const primaryCause = isGbm ? 'historico sintetico GBM' : 'historico legado sem rastro causal'
  const explanation = isGbm
    ? 'Candle sintetico gerado por seed/GBM; nao representa causa real de mercado.'
    : 'Candle legado persistido antes da rastreabilidade causal; nao ha rastro de motor para este movimento.'

  return {
    action: 'write',
    attribution: {
      version: 2,
      tickId: `backfill:${item.id}`,
      tickCount: 1,
      tickStartedAt: generatedAt,
      tickEndedAt: generatedAt,
      primaryEventId: null,
      primaryCause,
      primaryLayer: null,
      confidence: 'baixa',
      explanation,
      primaryExplanation: isGbm ? 'Historico sintetico GBM.' : 'Historico legado sem rastro causal.',
      evidenceSentence: 'Backfill honesto sem rastro causal direto.',
      caveatSentence: 'Nao usar como causa confirmada de mercado.',
      previousPrice,
      enginePrice: finalPrice,
      finalPrice,
      engineDelta: finalPrice - previousPrice,
      agentImpactPct: 0,
      agentDelta: 0,
      syntheticVolume: isGbm ? Number(item.volume) : 0,
      pendingBuyVolume: 0,
      pendingSellVolume: 0,
      orderImbalance: 0,
      sessionType: item.sessionType,
      layerContributions: [],
      causalEvents: [],
      appliedControls: [],
      qualityFlags: ['SYNTHETIC_HISTORY', 'LEGACY_BACKFILL'],
      payloadBytes: 0,
      generatedAt: new Date().toISOString(),
    },
  }
}

async function main() {
  const where: Prisma.PriceHistoryWhereInput = force ? {} : { attribution: { equals: Prisma.JsonNull } }

  let cursor: string | null = null
  let scanned = 0
  let written = 0
  const skippedByReason: Record<string, number> = {}
  const bySource: Record<string, { scanned: number; written: number; skipped: number }> = {}
  const sample: Array<{ id: string; source: string; action: string; reason?: string }> = []

  for (;;) {
    const batch: Candidate[] = await prisma.priceHistory.findMany({
      where,
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        source: true,
        timestamp: true,
        open: true,
        close: true,
        volume: true,
        sessionType: true,
        attribution: true,
      },
    })

    if (batch.length === 0) break

    for (const item of batch) {
      if (scanned >= limit) break
      scanned++
      const bucket = (bySource[item.source] ??= { scanned: 0, written: 0, skipped: 0 })
      bucket.scanned++

      // Em --force, nao sobrescrever atribuicao ja existente.
      if (force && item.attribution != null) {
        bucket.skipped++
        skippedByReason.ALREADY_HAS_ATTRIBUTION = (skippedByReason.ALREADY_HAS_ATTRIBUTION ?? 0) + 1
        continue
      }

      const decision = decide(item)
      if (sample.length < 20) {
        sample.push({
          id: item.id,
          source: item.source,
          action: decision.action,
          reason: decision.action === 'skip' ? decision.reason : undefined,
        })
      }

      if (decision.action === 'skip') {
        bucket.skipped++
        skippedByReason[decision.reason] = (skippedByReason[decision.reason] ?? 0) + 1
        continue
      }

      bucket.written++
      written++
      if (!dryRun) {
        await prisma.priceHistory.update({
          where: { id: item.id },
          data: { attribution: decision.attribution as Prisma.InputJsonValue },
        })
      }
    }

    cursor = batch[batch.length - 1]?.id ?? null
    if (scanned >= limit || cursor === null) break
  }

  console.log(JSON.stringify({
    dryRun,
    force,
    batchSize,
    limit: Number.isFinite(limit) ? limit : null,
    totals: { scanned, written, skipped: scanned - written },
    skippedByReason,
    bySource,
    sample,
    note: dryRun
      ? 'Dry-run: nenhum registro escrito. Execute com --write para aplicar; sem --force, apenas candles com attribution nula sao candidatos.'
      : 'Aplicacao habilitada. MOTOR e pulado de proposito (defeito operacional deve permanecer visivel).',
  }, null, 2))
}

main()
  .catch((err) => {
    console.error('[backfill-price-attribution] erro:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
