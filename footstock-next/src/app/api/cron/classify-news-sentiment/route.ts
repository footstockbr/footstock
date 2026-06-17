// GET /api/cron/classify-news-sentiment
// Item 15: classifica o sentimento das noticias via LLM (reusa a infra Anthropic do Assessor IA).
// Processa em lotes as noticias ainda nao classificadas (sentiment_classified_at IS NULL),
// atualiza sentiment + marca classified_at. Cobre o BACKFILL do acervo (5400 noticias dos feeds
// RSS, quase todas Neutro) e o FORWARD (noticias novas). Sequencial para limitar o ritmo das
// chamadas ao LLM. Idempotente: cada noticia so e classificada uma vez (marca classified_at).
// Auth: Bearer CRON_SECRET (mesmo padrao dos demais crons).

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { classifyNewsSentiment } from '@/lib/services/NewsSentimentClassifier'
import type { Sentiment } from '@prisma/client'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? 30)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 30

  try {
    const pending = await prisma.news.findMany({
      where: { sentimentClassifiedAt: null },
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: { id: true, title: true, content: true },
    })

    let classified = 0
    let bullish = 0
    let bearish = 0
    let neutral = 0
    let failed = 0

    for (const n of pending) {
      const sentiment = await classifyNewsSentiment(n.title, n.content)
      if (!sentiment) {
        // Falha transitoria (timeout/parse): nao marca; tenta na proxima rodada.
        failed++
        continue
      }
      await prisma.news.update({
        where: { id: n.id },
        data: { sentiment: sentiment as Sentiment, sentimentClassifiedAt: new Date() },
      })
      classified++
      if (sentiment === 'BULLISH') bullish++
      else if (sentiment === 'BEARISH') bearish++
      else neutral++
    }

    const remaining = await prisma.news.count({ where: { sentimentClassifiedAt: null } })

    return NextResponse.json({
      success: true,
      scanned: pending.length,
      classified,
      bullish,
      bearish,
      neutral,
      failed,
      remaining,
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/classify-news-sentiment] Erro:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
