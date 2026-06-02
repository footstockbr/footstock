/**
 * Restaura preços para o fairValue canônico do banco.
 *
 * Diferença do reset-asset-prices.ts:
 *   - USA o fairValue do DB como âncora (não recomputa por cluster)
 *   - NÃO sobrescreve fairValue (preserva a âncora L2)
 *   - Suporta produção (sem bloqueio por NODE_ENV)
 *   - Desfaz halt/circuit-breaker
 *   - Limpa Redis (GARCH, OFI, daily_vol) para motor reiniciar sem estado viciado
 *
 * Uso:
 *   dotenv -e .env -- npx tsx scripts/restore-prices-to-fairvalue.ts
 *
 * Flags opcionais:
 *   --dry-run        Simula sem gravar
 *   --only-floored   Apenas ativos com currentPrice <= 1.5
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import Redis from 'ioredis'

const args = process.argv.slice(2)
const DRY_RUN     = args.includes('--dry-run')
const ONLY_FLOORED = args.includes('--only-floored')
const FLOOR_THRESHOLD = 1.5

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter, log: ['error'] })

async function clearRedisMotorState(): Promise<void> {
  const url = process.env.REDIS_URL
  if (!url) {
    console.log('[restore] REDIS_URL ausente — pulando limpeza de Redis.')
    return
  }
  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true })
  try {
    await redis.connect()
    const patterns = [
      'garch:var:*',
      'ofi:state:*',
      'ofi:history:*',
      'daily_vol:*',
      'motor:tick:*',
    ]
    let total = 0
    for (const pattern of patterns) {
      let cursor = '0'
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
        cursor = next
        if (keys.length > 0) {
          if (!DRY_RUN) await redis.del(...keys)
          total += keys.length
        }
      } while (cursor !== '0')
    }
    const label = DRY_RUN ? '[dry-run] ' : ''
    console.log(`[restore] ${label}Redis: ${total} chaves de estado do motor apagadas.`)
  } catch (err) {
    console.warn('[restore] Falha ao limpar Redis (ignorado):', err instanceof Error ? err.message : err)
  } finally {
    await redis.quit().catch(() => null)
  }
}

async function main() {
  console.log(`[restore] Modo: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'} | Filtro: ${ONLY_FLOORED ? `apenas floored (<= ${FLOOR_THRESHOLD})` : 'todos os ativos'}`)
  console.log()

  const where = ONLY_FLOORED
    ? { isActive: true, currentPrice: { lte: FLOOR_THRESHOLD } }
    : { isActive: true }

  const assets = await prisma.asset.findMany({
    where,
    select: {
      id: true,
      ticker: true,
      displayName: true,
      cluster: true,
      division: true,
      currentPrice: true,
      fairValue: true,
    },
    orderBy: [{ division: 'asc' }, { ticker: 'asc' }],
  })

  console.log(`[restore] ${assets.length} ativos encontrados.\n`)

  let updated = 0
  let skipped = 0

  for (const a of assets) {
    const oldPrice = a.currentPrice.toNumber()
    const fv       = a.fairValue.toNumber()

    if (!fv || fv <= 0) {
      console.warn(`  ${a.ticker.padEnd(5)} SKIP  fairValue inválido (${fv})`)
      skipped++
      continue
    }

    const label = DRY_RUN ? '[dry]' : '     '
    console.log(`  ${label} ${a.ticker.padEnd(5)} ${a.cluster.padEnd(9)} ${oldPrice.toFixed(2).padStart(7)} → ${fv.toFixed(2).padStart(7)}  ${a.displayName}`)

    if (!DRY_RUN) {
      try {
        await prisma.asset.update({
          where: { id: a.id },
          data: {
            currentPrice: fv,
            openPrice:    fv,
            closePrice:   fv,
            // fairValue NAO é alterado — é a âncora canônica do L2
            volume:       BigInt(0),
            isHalted:     false,
            haltReason:   null,
            haltedUntil:  null,
          },
        })
        updated++
      } catch (err) {
        console.warn(`  [ERRO] ${a.ticker}: ${err instanceof Error ? err.message.split('\n')[0] : err}`)
      }
    } else {
      updated++
    }
  }

  console.log()
  console.log(`[restore] Atualizados: ${updated} | Pulados: ${skipped}`)

  if (!DRY_RUN) {
    const historyDeleted = await prisma.priceHistory.deleteMany({})
    console.log(`[restore] price_history: ${historyDeleted.count} linhas apagadas.`)
  } else {
    const count = await prisma.priceHistory.count()
    console.log(`[restore] [dry-run] price_history teria ${count} linhas apagadas.`)
  }

  await clearRedisMotorState()

  console.log()
  if (DRY_RUN) {
    console.log('[restore] DRY-RUN concluído. Para aplicar: remova --dry-run.')
  } else {
    console.log('[restore] Concluído. Reinicie o motor para que os preços sejam carregados.')
    console.log('          (warm start: closePrice = currentPrice = fairValue no próximo startup)')
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[restore] Erro fatal:', err)
  process.exit(1)
})
