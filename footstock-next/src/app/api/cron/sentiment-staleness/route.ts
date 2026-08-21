// GET /api/cron/sentiment-staleness
// Item 013: watchdog de frescor do sentimento.
// Le sentimentUpdatedAt de todos os ativos e classifica cada um em quatro estados:
// FRESCO, OBSOLETO, PAUSADO ou NUNCA_ESCRITO. Nunca recalcula nem escreve score.
// O limiar de staleness e configuravel via STALE_SENTIMENT_THRESHOLD_SECONDS (default 300s).
// Auth: Bearer CRON_SECRET (mesmo padrao dos demais crons).

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'

const DEFAULT_STALE_THRESHOLD_SECONDS = 300

type SentimentStalenessState = 'FRESCO' | 'OBSOLETO' | 'PAUSADO' | 'NUNCA_ESCRITO'

interface AssetStalenessEntry {
  id: string
  ticker: string
  state: SentimentStalenessState
  sentimentUpdatedAt: string | null
  ageSeconds: number | null
}

interface StalenessResponse {
  status: 'OK' | 'DEGRADED'
  threshold: number
  generatedAt: string
  coldStart: boolean
  summary: Record<SentimentStalenessState, number>
  assets: AssetStalenessEntry[]
}

function resolveThreshold(): number {
  const raw = Number(process.env.STALE_SENTIMENT_THRESHOLD_SECONDS ?? DEFAULT_STALE_THRESHOLD_SECONDS)
  if (!Number.isFinite(raw) || raw <= 0) {
    if (process.env.STALE_SENTIMENT_THRESHOLD_SECONDS !== undefined) {
      console.warn(
        `[cron/sentiment-staleness] STALE_SENTIMENT_THRESHOLD_SECONDS invalido (${process.env.STALE_SENTIMENT_THRESHOLD_SECONDS}), usando default ${DEFAULT_STALE_THRESHOLD_SECONDS}s`
      )
    }
    return DEFAULT_STALE_THRESHOLD_SECONDS
  }
  return raw
}

function classifyAsset(
  asset: { sentimentUpdatedAt: Date | null; isHalted: boolean },
  thresholdSeconds: number,
  now: Date
): { state: SentimentStalenessState; ageSeconds: number | null } {
  if (asset.isHalted) {
    return { state: 'PAUSADO', ageSeconds: null }
  }
  if (!asset.sentimentUpdatedAt) {
    return { state: 'NUNCA_ESCRITO', ageSeconds: null }
  }
  const ageSeconds = Math.floor(
    (now.getTime() - asset.sentimentUpdatedAt.getTime()) / 1000
  )
  if (ageSeconds > thresholdSeconds) {
    return { state: 'OBSOLETO', ageSeconds }
  }
  return { state: 'FRESCO', ageSeconds }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret) {
    console.error('[cron/sentiment-staleness] CRON_SECRET nao configurado')
    return NextResponse.json(
      { error: 'CRON_SECRET nao configurado' },
      { status: 500 }
    )
  }

  if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const thresholdSeconds = resolveThreshold()
  const now = new Date()

  try {
    const assets = await prisma.asset.findMany({
      select: {
        id: true,
        ticker: true,
        sentimentUpdatedAt: true,
        isHalted: true,
        haltedUntil: true,
        sentimentReason: true,
      },
    })

    const summary: Record<SentimentStalenessState, number> = {
      FRESCO: 0,
      OBSOLETO: 0,
      PAUSADO: 0,
      NUNCA_ESCRITO: 0,
    }

    const entries: AssetStalenessEntry[] = []

    for (const asset of assets) {
      const { state, ageSeconds } = classifyAsset(asset, thresholdSeconds, now)
      summary[state]++
      entries.push({
        id: asset.id,
        ticker: asset.ticker,
        state,
        sentimentUpdatedAt: asset.sentimentUpdatedAt?.toISOString() ?? null,
        ageSeconds,
      })
    }

    const totalAssets = assets.length
    const coldStart =
      totalAssets > 0 && summary.NUNCA_ESCRITO === totalAssets

    const overallStatus: 'OK' | 'DEGRADED' =
      summary.OBSOLETO > 0 || summary.NUNCA_ESCRITO > 0 ? 'DEGRADED' : 'OK'

    const response: StalenessResponse = {
      status: overallStatus,
      threshold: thresholdSeconds,
      generatedAt: now.toISOString(),
      coldStart,
      summary,
      assets: entries,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (err) {
    console.error('[cron/sentiment-staleness] Erro inesperado:', err)
    return NextResponse.json(
      { error: 'Erro interno no watchdog de frescor' },
      { status: 500 }
    )
  }
}
