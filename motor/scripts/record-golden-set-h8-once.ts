/**
 * One-shot H8 golden-set recorder (item 005, loop 07-31).
 *
 * This script only accepts real provider HTTP recording. Agent/local simulation
 * is fail-closed and is never emitted with provenance "real-http".
 *
 * Usage (cwd motor/):
 *   H8_RECORDING_MODE=real-http npx ts-node --transpile-only scripts/record-golden-set-h8-once.ts
 *
 * Outputs in the loop reviews directory:
 *   H8-GOLDEN-SET-RECORDED.json
 *   H8-GOLDEN-SET-RECORDING-STATUS.json
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
if (!process.env.ANTHROPIC_API_KEY) {
  loadEnv({ path: resolve(__dirname, '../../footstock-next/.env') })
}

const OUT_DIR = resolve(
  __dirname,
  '../../../../../blacksmith/loop-archives/07-31-plano-acao-fechamento-multi-time/reviews',
)
const ARTIFACT_PATH = join(OUT_DIR, 'H8-GOLDEN-SET-RECORDED.json')
const STATUS_PATH = join(OUT_DIR, 'H8-GOLDEN-SET-RECORDING-STATUS.json')

type RecordingState = 'blocked' | 'recording' | 'failed' | 'complete'
type RecordingProvenance = 'none' | 'simulated' | 'real-http'

interface RecordingStatus {
  schema: 'h8-golden-set-recording-status/v1'
  updatedAt: string
  status: RecordingState
  h8Decision: 'NOT_VERIFIED' | 'READY_FOR_FORMAL_REVIEW'
  provenance: RecordingProvenance
  acquisition: 'none' | 'agent-sim' | 'provider-http'
  productionH8Eligible: boolean
  mode: string
  provider: string | null
  model: string | null
  caseCount: number
  attemptedCount: number
  okCount: number
  failCount: number
  requestCount: number
  reasonCode?: string
  httpStatus?: number
  message?: string
  artifactPath?: string
}

const statusDefaults: Omit<
  RecordingStatus,
  'schema' | 'updatedAt' | 'status' | 'h8Decision' | 'provenance' | 'acquisition' | 'productionH8Eligible'
> = {
  mode: process.env.H8_RECORDING_MODE?.trim() || 'real-http',
  provider: null,
  model: null,
  caseCount: GOLDEN_SET.length,
  attemptedCount: 0,
  okCount: 0,
  failCount: 0,
  requestCount: 0,
}

function writeJson(path: string, value: unknown): void {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

function writeStatus(
  update: Pick<
    RecordingStatus,
    'status' | 'h8Decision' | 'provenance' | 'acquisition' | 'productionH8Eligible'
  > &
    Partial<RecordingStatus>,
): void {
  const payload: RecordingStatus = {
    schema: 'h8-golden-set-recording-status/v1',
    updatedAt: new Date().toISOString(),
    ...statusDefaults,
    ...update,
  }
  writeJson(STATUS_PATH, payload)
  console.log(
    `[H8-record] status=${payload.status} decision=${payload.h8Decision} wrote ${STATUS_PATH}`,
  )
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
  httpStatus?: number
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
  let cleaned = text.trim()
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) cleaned = fence[1].trim()

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
            (team) =>
              team &&
              typeof team.ticker === 'string' &&
              typeof team.sentiment === 'number' &&
              typeof team.confidence === 'number',
          )
          .map((team) => ({
            ticker: String(team.ticker),
            sentiment: Number(team.sentiment),
            confidence: Number(team.confidence),
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

function extractHttpStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null | undefined)?.status
  return typeof status === 'number' ? status : undefined
}

function terminalHttpBlock(
  err: unknown,
): { reasonCode: string; httpStatus?: number; message: string } | null {
  const message = err instanceof Error ? err.message : String(err)
  const httpStatus = extractHttpStatus(err)

  if (/credit balance|insufficient (funds|credits?)|billing|usage limit/i.test(message)) {
    return { reasonCode: 'provider_credit_unavailable', httpStatus, message }
  }
  if (httpStatus === 403) {
    return { reasonCode: 'provider_http_403', httpStatus, message }
  }
  if (httpStatus === 400) {
    return { reasonCode: 'provider_http_400', httpStatus, message }
  }
  return null
}

async function main(): Promise<void> {
  const mode = statusDefaults.mode
  if (mode !== 'real-http') {
    writeStatus({
      status: 'blocked',
      h8Decision: 'NOT_VERIFIED',
      provenance: 'simulated',
      acquisition: 'agent-sim',
      productionH8Eligible: false,
      reasonCode: 'simulation_not_eligible_for_h8',
      message: `H8_RECORDING_MODE=${mode}; somente real-http pode produzir evidencia H8.`,
    })
    console.error('[H8-record] BLOCKED: simulacao nunca recebe provenance=real-http')
    process.exitCode = 2
    return
  }

  const provider = getAIProvider()
  const model = resolveModel('claude-sonnet-4-6')
  statusDefaults.provider = provider
  statusDefaults.model = model

  const key =
    provider === 'kimi' ? process.env.KIMI_API_KEY : process.env.ANTHROPIC_API_KEY
  if (!key) {
    writeStatus({
      status: 'blocked',
      h8Decision: 'NOT_VERIFIED',
      provenance: 'none',
      acquisition: 'none',
      productionH8Eligible: false,
      reasonCode: 'provider_api_key_missing',
      message: `API key ausente para provider=${provider}.`,
    })
    console.error(`[H8-record] BLOCKED: API key ausente para provider=${provider}`)
    process.exitCode = 2
    return
  }

  writeStatus({
    status: 'recording',
    h8Decision: 'NOT_VERIFIED',
    provenance: 'none',
    acquisition: 'provider-http',
    productionH8Eligible: false,
  })

  console.log(`[H8-record] provider=${provider} model=${model} cases=${GOLDEN_SET.length}`)
  console.log(
    `[H8-record] baseURL=${
      provider === 'kimi' ? process.env.KIMI_BASE_URL : 'default-anthropic'
    }`,
  )

  const redis = new FakeRedis() as unknown as import('ioredis').default
  await redis.set('news:sonnet:tokens', 10_000, 'EX', 600)

  const classifier = new NewsClassifier(redis)
  const tickerMapLine = GOLDEN_ASSET_ALIASES.map(
    (asset) => `${asset.ticker}=${asset.searchText}`,
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

  const originalCreate = internal.anthropic.messages.create.bind(internal.anthropic.messages)
  let lastRawText = ''
  let lastHttpError: unknown = null
  let requestCount = 0

  ;(internal.anthropic.messages as { create: typeof originalCreate }).create = (async (
    ...args: Parameters<typeof originalCreate>
  ) => {
    requestCount += 1
    try {
      const response = await originalCreate(...args)
      const textBlock = (
        response as { content?: Array<{ type: string; text?: string }> }
      ).content?.find((block) => block.type === 'text')
      lastRawText = textBlock?.type === 'text' ? textBlock.text ?? '' : ''
      lastHttpError = null
      return response
    } catch (err) {
      lastHttpError = err
      throw err
    }
  }) as typeof originalCreate

  const recordedAt = new Date().toISOString()
  const cases: RecordedCase[] = []
  let okCount = 0
  let terminalBlock: ReturnType<typeof terminalHttpBlock> = null

  for (const gold of GOLDEN_SET) {
    const item: RawNewsItem = {
      url: `https://ge.globo.com/h8-record/${gold.id}`,
      title: gold.title,
      description: gold.description,
      source: 'Globo Esporte',
      publishedAt: '2026-07-28T12:00:00.000Z',
    }
    lastRawText = ''
    lastHttpError = null
    const startedAt = Date.now()

    try {
      const classified = await classifier.classify(item)
      if (lastHttpError) throw lastHttpError

      const latencyMs = Date.now() - startedAt
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
            `tickers=${llm.teams.map((team) => team.ticker).join(',')}`,
        )
      }
    } catch (err) {
      const latencyMs = Date.now() - startedAt
      const message = err instanceof Error ? err.message : String(err)
      const httpStatus = extractHttpStatus(err)
      cases.push({
        id: gold.id,
        title: gold.title,
        ok: false,
        error: message,
        httpStatus,
        rawText: lastRawText.slice(0, 2000),
        recordedAt,
        latencyMs,
      })
      console.error(`[H8-record] FAIL ${gold.id} ${message} latency=${latencyMs}ms`)

      terminalBlock = terminalHttpBlock(err)
      if (terminalBlock) {
        console.error(
          `[H8-record] BLOCKED ${terminalBlock.reasonCode}; abortando sem promover H8`,
        )
        break
      }
    }

    await new Promise((done) => setTimeout(done, 1200))
  }

  const complete = okCount === GOLDEN_SET.length && cases.length === GOLDEN_SET.length
  const artifactState: RecordingState = complete
    ? 'complete'
    : terminalBlock
      ? 'blocked'
      : 'failed'

  const artifact = {
    schema: 'h8-golden-set-recorded/v2',
    status: artifactState,
    h8Decision: complete ? 'READY_FOR_FORMAL_REVIEW' : 'NOT_VERIFIED',
    provenance: 'real-http',
    acquisition: 'provider-http',
    productionH8Eligible: complete,
    recordedAt,
    provider,
    model,
    classifier_output_version_base: 'news-classifier/2026-07-28-multi-team',
    caseCount: GOLDEN_SET.length,
    attemptedCount: cases.length,
    okCount,
    failCount: cases.length - okCount,
    requestCount,
    terminalBlock,
    cases,
  }
  writeJson(ARTIFACT_PATH, artifact)

  writeStatus({
    status: artifactState,
    h8Decision: complete ? 'READY_FOR_FORMAL_REVIEW' : 'NOT_VERIFIED',
    provenance: 'real-http',
    acquisition: 'provider-http',
    productionH8Eligible: complete,
    attemptedCount: cases.length,
    okCount,
    failCount: cases.length - okCount,
    requestCount,
    reasonCode: terminalBlock?.reasonCode ?? (complete ? undefined : 'incomplete_recording'),
    httpStatus: terminalBlock?.httpStatus,
    message: terminalBlock?.message?.slice(0, 1000),
    artifactPath: ARTIFACT_PATH,
  })

  console.log(`[H8-record] wrote ${ARTIFACT_PATH}`)
  console.log(`[H8-record] ok=${okCount}/${GOLDEN_SET.length}`)

  if (!complete) process.exitCode = 3
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  writeStatus({
    status: 'failed',
    h8Decision: 'NOT_VERIFIED',
    provenance: 'none',
    acquisition: 'none',
    productionH8Eligible: false,
    reasonCode: 'unexpected_recorder_failure',
    message: message.slice(0, 1000),
  })
  console.error(err)
  process.exitCode = 1
})
