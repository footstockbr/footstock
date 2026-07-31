/**
 * One-shot H8 golden-set recorder (item 005, loop 07-31-plano-acao-fechamento-multi-time).
 *
 * Uses the REAL NewsClassifier path (same prompt/parser). Does NOT reimplement the
 * prompt. Captures raw LLM JSON by wrapping anthropic.messages.create.
 *
 * Usage (cwd motor/):
 *   npx ts-node --transpile-only scripts/record-golden-set-h8-once.ts
 *
 * Env (from motor/.env): AI_PROVIDER plus KIMI or ANTHROPIC keys.
 * Output: blacksmith/.../reviews/H8-GOLDEN-SET-RECORDED.json (relative to repo root)
 */

import { config as loadEnv } from 'dotenv'
import { resolve, join } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import Anthropic from '@anthropic-ai/sdk'
import { NewsClassifier } from '../src/news/NewsClassifier'
import type { RawNewsItem } from '../src/news/NewsQueue'
import {
  GOLDEN_SET,
  GOLDEN_ASSET_ALIASES,
} from '../src/news/__tests__/fixtures/multi-team-golden-set'
import { getAIProvider, resolveModel } from '../src/news/ai-provider'
import { buildAliasIndex } from '../src/news/ticker-fallback'

loadEnv({ path: resolve(__dirname, '../.env') })
// Prefer anthropic key from parent if motor key empty and provider anthropic
if (!process.env.ANTHROPIC_API_KEY) {
  loadEnv({ path: resolve(__dirname, '../../footstock-next/.env') })
}

class FakeRedis {
  private store = new Map<string, number>()
  async exists(k: string) {
    return this.store.has(k) ? 1 : 0
  }
  async set(k: string, v: number, _m?: string, _t?: number) {
    this.store.set(k, Number(v))
    return 'OK'
  }
  async decr(k: string) {
    const n = (this.store.get(k) ?? 0) - 1
    this.store.set(k, n)
    return n
  }
  async incr(k: string) {
    const n = (this.store.get(k) ?? 0) + 1
    this.store.set(k, n)
    return n
  }
}

interface RecordedCase {
  id: string
  title: string
  ok: boolean
  error?: string
  rawText?: string
  llm?: {
    teams: Array<{ ticker: string; sentiment: number; confidence: number }>
    impactCategory: string
    relevance: number
  }
  classified?: unknown
  recordedAt: string
  latencyMs: number
}

function parseLlmJson(text: string): RecordedCase['llm'] | null {
  // Strip markdown fences if the model wraps JSON
  let cleaned = text.trim()
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) cleaned = fence[1].trim()
  // Find first { ... last }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      teams?: Array<{ ticker?: unknown; sentiment?: unknown; confidence?: unknown }>
      impactCategory?: unknown
      relevance?: unknown
    }
    const teams = Array.isArray(parsed.teams)
      ? parsed.teams
          .filter(
            (t) =>
              t &&
              typeof t.ticker === 'string' &&
              typeof t.sentiment === 'number' &&
              typeof t.confidence === 'number',
          )
          .map((t) => ({
            ticker: String(t.ticker),
            sentiment: Number(t.sentiment),
            confidence: Number(t.confidence),
          }))
      : []
    return {
      teams,
      impactCategory:
        typeof parsed.impactCategory === 'string' ? parsed.impactCategory : 'INSTITUCIONAL',
      relevance:
        typeof parsed.relevance === 'number' && Number.isFinite(parsed.relevance)
          ? parsed.relevance
          : 0,
    }
  } catch {
    return null
  }
}

async function main() {
  const provider = getAIProvider()
  const model = resolveModel('claude-sonnet-4-6')
  const key =
    provider === 'kimi' ? process.env.KIMI_API_KEY : process.env.ANTHROPIC_API_KEY

  if (!key) {
    console.error(`BLOCKED: API key ausente para provider=${provider}`)
    process.exit(2)
  }

  console.log(`[H8-record] provider=${provider} model=${model} cases=${GOLDEN_SET.length}`)
  console.log(`[H8-record] baseURL=${provider === 'kimi' ? process.env.KIMI_BASE_URL : 'default-anthropic'}`)

  const redis = new FakeRedis() as unknown as import('ioredis').default
  await redis.set('news:sonnet:tokens', 10_000, 'EX', 600)

  const classifier = new NewsClassifier(redis)

  // Inject golden-set alias map so prompt sees same tickers as the suite.
  const tickerMapLine = GOLDEN_ASSET_ALIASES.map(
    (a) => `${a.ticker}=${a.searchText}`,
  ).join(' | ')
  const internal = classifier as unknown as {
    tickerMapLine: string
    tickerIndex: ReturnType<typeof buildAliasIndex>
    rebuildStaticPrefix: () => Promise<void>
    anthropic: Anthropic
    boundModel: string
  }
  internal.tickerMapLine = tickerMapLine
  internal.tickerIndex = buildAliasIndex([...GOLDEN_ASSET_ALIASES])
  internal.boundModel = model
  await internal.rebuildStaticPrefix()

  // Wrap messages.create to capture raw text while still executing the call.
  const originalCreate = internal.anthropic.messages.create.bind(internal.anthropic.messages)
  let lastRawText = ''
  ;(internal.anthropic.messages as { create: typeof originalCreate }).create = (async (
    ...args: Parameters<typeof originalCreate>
  ) => {
    const response = await originalCreate(...args)
    const textBlock = (response as { content?: Array<{ type: string; text?: string }> }).content?.find(
      (b) => b.type === 'text',
    )
    lastRawText = textBlock?.type === 'text' ? textBlock.text ?? '' : ''
    return response
  }) as typeof originalCreate

  const recordedAt = new Date().toISOString()
  const cases: RecordedCase[] = []
  let okCount = 0

  for (const gold of GOLDEN_SET) {
    const item: RawNewsItem = {
      url: `https://ge.globo.com/h8-record/${gold.id}`,
      title: gold.title,
      description: gold.description,
      source: 'Globo Esporte',
      publishedAt: '2026-07-28T12:00:00.000Z',
    }
    lastRawText = ''
    const t0 = Date.now()
    try {
      const classified = await classifier.classify(item)
      const latencyMs = Date.now() - t0
      const llm = parseLlmJson(lastRawText)
      if (!llm) {
        cases.push({
          id: gold.id,
          title: gold.title,
          ok: false,
          error: `parse_failed raw_len=${lastRawText.length}`,
          rawText: lastRawText.slice(0, 2000),
          classified,
          recordedAt,
          latencyMs,
        })
        console.error(`[H8-record] FAIL ${gold.id} parse_failed latency=${latencyMs}ms`)
      } else {
        cases.push({
          id: gold.id,
          title: gold.title,
          ok: true,
          llm,
          classified,
          recordedAt,
          latencyMs,
        })
        okCount += 1
        console.log(
          `[H8-record] OK ${gold.id} teams=${llm.teams.length} latency=${latencyMs}ms ` +
            `tickers=${llm.teams.map((t) => t.ticker).join(',')}`,
        )
      }
    } catch (err) {
      const latencyMs = Date.now() - t0
      const msg = err instanceof Error ? err.message : String(err)
      cases.push({
        id: gold.id,
        title: gold.title,
        ok: false,
        error: msg,
        rawText: lastRawText.slice(0, 2000),
        recordedAt,
        latencyMs,
      })
      console.error(`[H8-record] FAIL ${gold.id} ${msg} latency=${latencyMs}ms`)
    }
    // Small pause to respect rate limits (60/min)
    await new Promise((r) => setTimeout(r, 1200))
  }

  const artifact = {
    schema: 'h8-golden-set-recorded/v1',
    recordedAt,
    provider,
    model,
    classifier_output_version_base: 'news-classifier/2026-07-28-multi-team',
    caseCount: GOLDEN_SET.length,
    okCount,
    failCount: GOLDEN_SET.length - okCount,
    cases,
  }

  const outDir = resolve(
    __dirname,
    '../../../../../blacksmith/loop-archives/07-31-plano-acao-fechamento-multi-time/reviews',
  )
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, 'H8-GOLDEN-SET-RECORDED.json')
  writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8')
  console.log(`[H8-record] wrote ${outPath}`)
  console.log(`[H8-record] ok=${okCount}/${GOLDEN_SET.length}`)

  if (okCount < GOLDEN_SET.length) {
    process.exit(3)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
