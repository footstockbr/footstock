// GET /api/cron/reconcile-null-tickers
// Safety-net: re-resolve o ticker de notícias PUBLICADAS ainda "sem time",
// usando o resolvedor determinístico hardened (pelo TÍTULO, precision-first).
//
// Por que existe: a fonte primária de "sem time" é o motor (RSS Gazeta) quando o
// classificador LLM devolve ticker vazio; este cron cura linhas que se tornaram
// resolvíveis depois (alias adicionado, search_text corrigido, etc.) e linhas
// legadas anteriores ao hardening. Idempotente: só toca em ticker null/'' e roda
// de novo é no-op. NÃO move preço (impacto só dispara no publish-time do motor).
//
// Auth: Bearer CRON_SECRET (mesmo padrão dos demais crons). Disparado pelo
// scheduler do serviço motor (motor/src/scheduler) via cronProxy.

import { NextRequest, NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { resolveTickerFromTitle } from '@/lib/utils/resolve-ticker'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  const rawLimit = Number(req.nextUrl.searchParams.get('limit') ?? 200)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 1000)
    : 200

  let scanned = 0
  let reconciled = 0
  let noMatch = 0
  let failed = 0

  try {
    const unlinked = await prisma.news.findMany({
      where: {
        isPublished: true,
        OR: [{ ticker: null }, { ticker: '' }],
      },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    scanned = unlinked.length

    for (const news of unlinked) {
      try {
        // Precision-first: resolve pelo TÍTULO (favorece o time-sujeito).
        const ticker = await resolveTickerFromTitle(news.title)
        if (!ticker) {
          noMatch++
          continue
        }
        const asset = await prisma.asset.findUnique({
          where: { ticker },
          select: { id: true },
        })
        await prisma.news.update({
          where: { id: news.id },
          data: {
            ticker,
            ...(asset ? { assetIds: [asset.id] } : {}),
          },
        })
        reconciled++
      } catch (err) {
        failed++
        console.error(`[cron/reconcile-null-tickers] Falha em ${news.id}: ${(err as Error).message}`)
      }
    }

    console.log(
      `[cron/reconcile-null-tickers] scanned=${scanned} reconciled=${reconciled} no_match=${noMatch} failed=${failed}`,
    )
    return NextResponse.json({
      success: failed === 0,
      scanned,
      reconciled,
      no_match: noMatch,
      failed,
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reconcile-null-tickers] Erro:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
