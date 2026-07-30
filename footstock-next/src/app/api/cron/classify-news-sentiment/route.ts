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
import type { Prisma, Sentiment } from '@prisma/client'

// Item 020 / ST002 — DB-18 metade (b) (source.md:1100): o cron de sentimento nao e
// a autoridade sobre linha escrita pelo motor. Predicado UNICO e nomeado, usado
// tanto no scan quanto no `count` de `remaining`: se os dois divergirem, o backlog
// reportado nunca chega a zero e a metrica passa a mentir para sempre.
//
// A clausula de grupo e a disjuncao explicita abaixo (rank nulo OU rank zero), e
// NAO uma negacao do tipo "nao maior que zero". `groupRank` e `Int?`
// (prisma/schema.prisma:30) e o acervo pre-backfill tem `group_rank` NULL: negar
// `group_rank > 0` em SQL avalia para NULL quando a coluna e NULL, NULL nao
// satisfaz o WHERE, e a linha legada seria excluida do cron — quebrando o BACKFILL
// do acervo RSS que o cabecalho acima declara cobrir. O trigger
// `news_group_defaults_trg` da M067 so age em INSERT, entao `group_rank` NULL segue
// alcancavel na janela entre aplicar a migration e concluir o backfill do item 008.
// Nenhuma destas linhas repete os literais que a Verificacao do item 020 grepa como
// guarda (passos 3a e 3b): comentario que casa a guarda a torna inutil.
// Tipado como `Prisma.NewsWhereInput` (nao `as const`): o `as const` deixa o `OR`
// readonly e o Prisma exige array mutavel; o tipo nomeado tambem faz o compilador
// validar o proprio predicado.
const SENTIMENT_ELIGIBLE_WHERE: Prisma.NewsWhereInput = {
  sentimentClassifiedAt: null,
  OR: [{ groupRank: null }, { groupRank: 0 }],
}

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
      where: SENTIMENT_ELIGIBLE_WHERE,
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: { id: true, title: true, content: true, groupId: true, groupRank: true },
    })

    let classified = 0
    let bullish = 0
    let bearish = 0
    let neutral = 0
    let failed = 0
    let skippedGroup = 0

    for (const n of pending) {
      // Item 020 / ST002 — segunda barreira de DB-18(b), no ponto de escrita
      // (source.md:1069 instrumenta exatamente aqui). O `where` acima ja exclui
      // irmao de grupo; se um chegar, o `where` regrediu. A linha NAO e escrita
      // (criterio 24: linha multi-time de origem motor permanece com o sentimento
      // que o motor gravou) e o evento sai com nome estavel, porque os itens 022 e
      // 023 consomem essa string como fonte da metrica de alvo zero.
      //
      // A condicao e `groupRank > 0`, NUNCA `groupId != null`: o trigger
      // `news_group_defaults_trg` (M067) seta `group_id := id` em TODO insert, logo
      // `groupId` nao nulo vale para toda linha e o log dispararia em todas elas —
      // ruido que cega justamente a falha que a metrica existe para detectar.
      if (n.groupRank !== null && n.groupRank > 0) {
        skippedGroup++
        console.warn('cron_sentiment_group_row_touched', {
          newsId: n.id,
          groupId: n.groupId,
          groupRank: n.groupRank,
        })
        continue
      }
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

    // MESMO predicado do scan (ST002.3): `remaining` tem que contar o universo que
    // o cron de fato processa. Contar linha que ele nunca vai tocar mantem o
    // backlog eternamente acima de zero.
    const remaining = await prisma.news.count({ where: SENTIMENT_ELIGIBLE_WHERE })

    return NextResponse.json({
      success: true,
      scanned: pending.length,
      classified,
      bullish,
      bearish,
      neutral,
      failed,
      remaining,
      // Item 020 / ST002.5: campo NOVO, ausente quando nao houve skip (mesmo padrao
      // de `skipped_group` que o item 019 usou em E7/E8). Nao-zero e sinal duro de
      // regressao no `where`, ja que o predicado deveria ter filtrado antes.
      ...(skippedGroup > 0 ? { skipped_group: skippedGroup } : {}),
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/classify-news-sentiment] Erro:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
