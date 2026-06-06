import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const dryRun = !process.argv.includes('--write')
const force = process.argv.includes('--force')

if (force && process.env.NODE_ENV === 'production') {
  throw new Error('Backfill --force proibido em producao.')
}

async function main() {
  const candidates = await prisma.priceHistory.findMany({
    where: force
      ? {}
      : {
          attribution: { equals: null },
        },
    take: 100,
    orderBy: { timestamp: 'asc' },
  })

  const sample = candidates.slice(0, 10).map((item) => ({
    id: item.id,
    source: item.source,
    timestamp: item.timestamp,
    attribution: item.source === 'GBM'
      ? {
          version: 2,
          tickId: `backfill:${item.id}`,
          tickCount: 1,
          tickStartedAt: item.timestamp.toISOString(),
          tickEndedAt: item.timestamp.toISOString(),
          primaryEventId: null,
          primaryCause: 'historico sintetico GBM',
          primaryLayer: null,
          confidence: 'baixa',
          explanation: 'Candle sintetico gerado por seed/GBM; nao representa causa real de mercado.',
          primaryExplanation: 'Historico sintetico GBM.',
          evidenceSentence: 'Backfill honesto sem rastro causal direto.',
          caveatSentence: 'Nao usar como causa confirmada de mercado.',
          previousPrice: Number(item.open),
          enginePrice: Number(item.close),
          finalPrice: Number(item.close),
          engineDelta: Number(item.close) - Number(item.open),
          agentImpactPct: 0,
          agentDelta: 0,
          syntheticVolume: Number(item.volume),
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
        }
      : null,
  }))

  console.log(JSON.stringify({
    dryRun,
    force,
    candidates: candidates.length,
    sample,
    note: dryRun ? 'Execute com --write para aplicar; registros com atribuicao existente nao sao sobrescritos sem --force.' : 'Aplicacao habilitada.',
  }, null, 2))

  if (dryRun) return

  for (const item of sample) {
    if (!item.attribution) continue
    await prisma.priceHistory.update({
      where: { id: item.id },
      data: { attribution: item.attribution as never },
    })
  }
}

main()
  .finally(() => prisma.$disconnect())
