// ============================================================================
// FootStock — backfill-news-tickers
// Backfill/auditoria idempotente de notícias "sem time" (ticker null/'').
// Reutiliza o MESMO núcleo determinístico (ticker-resolver-core) usado em runtime
// — zero duplicação da tabela de aliases. Resolve pelo TÍTULO (precision-first).
//
// Uso (rodar de footstock-next/):
//   DATABASE_URL=... npx tsx scripts/backfill-news-tickers.ts            # dry-run (default)
//   DATABASE_URL=... npx tsx scripts/backfill-news-tickers.ts --apply    # grava
//   flags: --apply  --all (inclui não-publicadas)  --limit N  --since DIAS  --json
//
// Seguro: só toca em linhas com ticker null/'' → re-rodar é no-op. NÃO publica no
// Redis (não move preço); apenas corrige a coluna ticker + asset_ids no DB.
// ============================================================================

import { Client } from 'pg'
import { buildAliasIndex, resolveFromIndex } from '../src/lib/utils/ticker-resolver-core'

interface Args {
  apply: boolean
  all: boolean
  limit: number | null
  since: number | null
  json: boolean
}

function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, all: false, limit: null, since: null, json: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--apply') a.apply = true
    else if (t === '--all') a.all = true
    else if (t === '--json') a.json = true
    else if (t === '--limit') a.limit = Math.max(1, Math.trunc(Number(argv[++i])))
    else if (t === '--since') a.since = Math.max(1, Math.trunc(Number(argv[++i])))
  }
  return a
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('ERRO: defina DATABASE_URL no ambiente.')
    process.exit(1)
  }

  const client = new Client({ connectionString: dbUrl })
  await client.connect()

  try {
    // 1. Índice de aliases a partir do search_text real (denylist + colisão no core).
    const assetsRes = await client.query<{ ticker: string; search_text: string | null }>(
      `SELECT ticker, search_text FROM assets WHERE is_active = true`,
    )
    const assetIdRes = await client.query<{ id: string; ticker: string }>(
      `SELECT id, ticker FROM assets WHERE is_active = true`,
    )
    const idByTicker = new Map(assetIdRes.rows.map(r => [r.ticker, r.id]))
    const index = buildAliasIndex(
      assetsRes.rows.map(r => ({ ticker: r.ticker, searchText: r.search_text })),
    )

    // 2. Notícias sem ticker.
    const where: string[] = [`(ticker IS NULL OR ticker = '')`]
    if (!args.all) where.push(`is_published = true`)
    if (args.since) where.push(`created_at > now() - interval '${args.since} days'`)
    const limitSql = args.limit ? `LIMIT ${args.limit}` : ''
    const newsRes = await client.query<{ id: string; title: string }>(
      `SELECT id, title FROM news WHERE ${where.join(' AND ')} ORDER BY created_at DESC ${limitSql}`,
    )

    let matched = 0
    let applied = 0
    const byTicker: Record<string, number> = {}
    const samples: Array<{ ticker: string; alias: string; title: string }> = []
    const idsByTicker = new Map<string, string[]>()

    for (const news of newsRes.rows) {
      const hit = resolveFromIndex(news.title, index)
      if (!hit) continue
      matched++
      byTicker[hit.ticker] = (byTicker[hit.ticker] || 0) + 1
      if (samples.length < 25) samples.push({ ticker: hit.ticker, alias: hit.alias, title: news.title })
      const arr = idsByTicker.get(hit.ticker)
      if (arr) arr.push(news.id)
      else idsByTicker.set(hit.ticker, [news.id])
    }

    if (args.apply) {
      // Batch por ticker (1 UPDATE por ticker) em vez de 1 por linha — evita
      // milhares de round-trips. Guard `ticker IS NULL OR ''` mantém idempotência.
      for (const [ticker, ids] of idsByTicker) {
        const assetId = idByTicker.get(ticker)
        const res = await client.query(
          `UPDATE news SET ticker = $1, asset_ids = $2 WHERE id = ANY($3::text[]) AND (ticker IS NULL OR ticker = '')`,
          [ticker, assetId ? [assetId] : [], ids],
        )
        applied += res.rowCount ?? 0
      }
    }

    const summary = {
      mode: args.apply ? 'APPLY' : 'DRY-RUN',
      scope: args.all ? 'all' : 'published-only',
      scanned: newsRes.rows.length,
      matched,
      applied,
      no_match: newsRes.rows.length - matched,
      by_ticker: Object.fromEntries(Object.entries(byTicker).sort((a, b) => b[1] - a[1])),
    }

    if (args.json) {
      console.log(JSON.stringify({ summary, samples }, null, 2))
    } else {
      console.log(`\n=== backfill-news-tickers [${summary.mode}] (${summary.scope}) ===`)
      console.log(`scanned=${summary.scanned}  matched=${summary.matched}  applied=${summary.applied}  no_match=${summary.no_match}`)
      console.log('by ticker:', Object.entries(summary.by_ticker).map(([k, v]) => `${k}:${v}`).join('  '))
      console.log('\n--- amostra (até 25) ---')
      for (const s of samples) console.log(`  ${s.ticker} <${s.alias}> | ${s.title.slice(0, 75)}`)
      if (!args.apply) console.log('\n(dry-run — nada gravado. Use --apply para persistir.)')
    }
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
