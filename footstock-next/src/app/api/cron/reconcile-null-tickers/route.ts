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
import {
  decideLineAssetIds,
  siblingAssetIdsFrom,
  siblingCountFrom,
  type LineAssetIdsSkipReason,
} from '@/lib/services/newsLineAssetIds'

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
  let skippedGroup = 0
  const skippedByReason: Record<LineAssetIdsSkipReason, number> = {
    unchanged: 0,
    'legacy-multi-asset': 0,
    'sibling-owns-asset': 0,
    'group-row-clear': 0,
  }

  try {
    const unlinked = await prisma.news.findMany({
      where: {
        isPublished: true,
        OR: [{ ticker: null }, { ticker: '' }],
      },
      // Item 019 / ST006: `groupId`, `groupRank` e `assetIds` entram no select para
      // `decideLineAssetIds` (DB-19). O `where` do scan NAO muda: excluir linha de
      // grupo do scan e DB-18 / item 020.
      select: { id: true, title: true, groupId: true, groupRank: true, assetIds: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    scanned = unlinked.length

    // Item 019 / ST006 — I-leitura-de-grupo em lote: UMA consulta para todos os
    // grupos do scan. Este e o pior caso do censo (roda por cron, sem humano), entao
    // a leitura de irmaos nao pode ficar dentro do loop.
    const groupIds = Array.from(
      new Set(unlinked.map(news => news.groupId).filter((gid): gid is string => Boolean(gid)))
    )
    const siblingsByGroup = new Map<string, Array<{ id: string; assetIds: string[] }>>()
    if (groupIds.length > 0) {
      const groupRows = await prisma.news.findMany({
        where: { groupId: { in: groupIds } },
        select: { id: true, groupId: true, assetIds: true },
      })
      for (const row of groupRows) {
        if (!row.groupId) continue
        const bucket = siblingsByGroup.get(row.groupId)
        if (bucket) bucket.push({ id: row.id, assetIds: row.assetIds })
        else siblingsByGroup.set(row.groupId, [{ id: row.id, assetIds: row.assetIds }])
      }
    }

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
        // Item 019 / ST006 (E8): DB-19. Uma linha com `ticker` nulo dentro de grupo
        // multi-time e a ancora "sem time" ou linha corrompida — carimbar nela o
        // asset de um irmao achata o grupo, e este caminho roda sem humano
        // (source.md:1141). `where: { id }` permanece (I-linha).
        //
        // Asset nulo NAO entra no helper (mesma razao do E7): aqui "sem asset
        // correspondente" e ticker irresolvivel, nao intencao de limpar. O
        // comportamento anterior omitia a coluna; transformar isso em `assetIds: []`
        // apagaria o vinculo de linha legada com `ticker` nulo e `assetIds` cheio.
        const assetId = asset?.id ?? null
        let assetIdsData: { assetIds: string[] } | undefined
        if (assetId !== null) {
          const decision = decideLineAssetIds({
            current: {
              id: news.id,
              groupId: news.groupId,
              groupRank: news.groupRank,
              // Coalesce de fronteira: linha fora de contrato nao pode virar
              // `failed++` silencioso num caminho sem humano.
              assetIds: news.assetIds ?? [],
            },
            resolvedAssetId: assetId,
            siblingAssetIds: news.groupId
              ? siblingAssetIdsFrom(siblingsByGroup.get(news.groupId) ?? [], news.id)
              : [],
            // Mesmo caso de E7: `assetId` nao-nulo aqui, `group-row-clear` inalcancavel
            // por este caminho. Declarado porque este e o pior caso do censo (roda sem
            // humano) e o param obrigatorio nao deixa o estado de grupo implicito.
            siblingCount: news.groupId
              ? siblingCountFrom(siblingsByGroup.get(news.groupId) ?? [], news.id)
              : 0,
          })
          if (decision.action === 'write') {
            assetIdsData = { assetIds: decision.assetIds }
          } else {
            skippedGroup++
            skippedByReason[decision.reason]++
            // Zero Silencio: skip por linha visivel, alem do agregado no log final.
            console.warn('[cron/reconcile-null-tickers] assetIds preservado (DB-19)', {
              newsId: news.id,
              groupId: news.groupId,
              reason: decision.reason,
            })
          }
        }
        await prisma.news.update({
          where: { id: news.id },
          data: {
            ticker,
            ...(assetIdsData ?? {}),
          },
        })
        reconciled++
      } catch (err) {
        failed++
        console.error(`[cron/reconcile-null-tickers] Falha em ${news.id}: ${(err as Error).message}`)
      }
    }

    console.log(
      `[cron/reconcile-null-tickers] scanned=${scanned} reconciled=${reconciled} no_match=${noMatch} failed=${failed} skipped_group=${skippedGroup} skipped_by_reason=${JSON.stringify(skippedByReason)}`,
    )
    // `success` continua sendo `failed === 0`: skip NAO e falha, e comportamento
    // correto sob DB-19. Se o item 020 precisar de sinal duro para o gate C9, ele
    // adiciona metrica propria.
    return NextResponse.json({
      success: failed === 0,
      scanned,
      reconciled,
      no_match: noMatch,
      failed,
      // Item 019 / ST006: campos NOVOS, ausentes quando nao houve skip (mesmo padrao
      // do E7 e do `assetIdsSkipped` das rotas PATCH). O agregado sempre sai no log
      // final, entao a observabilidade do cron nao depende deste corpo.
      ...(skippedGroup > 0
        ? { skipped_group: skippedGroup, skipped_by_reason: skippedByReason }
        : {}),
      processedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reconcile-null-tickers] Erro:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
