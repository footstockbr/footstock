/**
 * Reset completo do estado de mercado para apresentação:
 *   - Atribui preço por cluster (faixa canônica) com leve variação determinística
 *     baseada no ticker — assets dentro do mesmo cluster ficam próximos mas
 *     distinguíveis.
 *   - Iguala currentPrice = openPrice = closePrice = fairValue = price.
 *   - Zera volume, isHalted, haltReason.
 *   - Limpa price_history (gráficos zerados).
 *   - Limpa chaves Redis residuais do motor.
 *
 * Faixas de preço por cluster (FS$):
 *   A_TOP    → 28.00 – 42.00   (Flamengo, Palmeiras, Corinthians, etc.)
 *   A_MID    → 16.00 – 24.00   (Cruzeiro, Bahia, Fortaleza)
 *   A_SMALL  →  9.00 – 14.00   (clubes Série A menores)
 *   B_LIQUID →  4.00 –  7.00   (Série B liquido)
 *   B_ILLIQ  →  1.80 –  3.50   (Série B ilíquido)
 *
 * Uso: dotenv -e .env -- npx tsx scripts/reset-asset-prices.ts
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import Redis from 'ioredis'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter, log: ['error'] })

const PRICE_RANGES: Record<string, [number, number]> = {
  A_TOP:    [28.0, 42.0],
  A_MID:    [16.0, 24.0],
  A_SMALL:  [ 9.0, 14.0],
  B_LIQUID: [ 4.0,  7.0],
  B_ILLIQ:  [ 1.8,  3.5],
}

/** Hash determinístico do ticker → [0, 1) para spread previsível dentro do cluster. */
function tickerSeed(ticker: string): number {
  let h = 0
  for (let i = 0; i < ticker.length; i++) {
    h = (h * 31 + ticker.charCodeAt(i)) | 0
  }
  return Math.abs(h % 10_000) / 10_000
}

function priceForCluster(cluster: string, ticker: string): number {
  const [min, max] = PRICE_RANGES[cluster] ?? PRICE_RANGES.A_SMALL
  const t = tickerSeed(ticker)
  const raw = min + (max - min) * t
  return parseFloat(raw.toFixed(2))
}

async function clearRedis(): Promise<void> {
  const url = process.env.REDIS_URL
  if (!url) {
    console.log('[reset] REDIS_URL ausente — pulando limpeza de Redis.')
    return
  }
  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true })
  try {
    await redis.connect()
    const patterns = ['garch:var:*', 'ofi:state:*', 'ofi:history:*', 'daily_vol:*', 'motor:tick:*']
    let totalDeleted = 0
    for (const pattern of patterns) {
      let cursor = '0'
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
        cursor = next
        if (keys.length > 0) {
          await redis.del(...keys)
          totalDeleted += keys.length
        }
      } while (cursor !== '0')
    }
    console.log(`[reset] Redis: ${totalDeleted} chaves apagadas.`)
  } catch (err) {
    console.warn('[reset] Falha ao limpar Redis (ignorado):', err instanceof Error ? err.message : err)
  } finally {
    await redis.quit().catch(() => null)
  }
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[reset] BLOQUEADO em produção.')
    process.exit(1)
  }

  console.log('[reset] Lendo assets atuais do banco...\n')

  const assets = await prisma.asset.findMany({
    select: { id: true, ticker: true, displayName: true, cluster: true, division: true },
    orderBy: [{ division: 'asc' }, { ticker: 'asc' }],
  })

  console.log(`[reset] ${assets.length} assets encontrados. Aplicando preços por cluster:\n`)

  let updated = 0
  for (const a of assets) {
    const price = priceForCluster(a.cluster, a.ticker)
    try {
      await prisma.asset.update({
        where: { id: a.id },
        data: {
          currentPrice: price,
          openPrice: price,
          closePrice: price,
          fairValue: price,
          volume: BigInt(0),
          isHalted: false,
          haltReason: null,
        },
      })
      updated++
      console.log(`  ${a.ticker.padEnd(5)} ${a.cluster.padEnd(9)} ${a.displayName.padEnd(45)} FS$ ${price.toFixed(2)}`)
    } catch (err) {
      console.warn(`[reset] ${a.ticker} update falhou: ${err instanceof Error ? err.message.split('\n')[0] : err}`)
    }
  }

  console.log(`\n[reset] Assets atualizados: ${updated}/${assets.length}`)

  const historyDeleted = await prisma.priceHistory.deleteMany({})
  console.log(`[reset] price_history: ${historyDeleted.count} linhas apagadas.`)

  await clearRedis()

  console.log('\n[reset] Concluído. Reinicie o motor — preços e variação zerados.')
  await prisma.$disconnect()
}

main().catch(err => {
  console.error('[reset] Erro fatal:', err)
  process.exit(1)
})
