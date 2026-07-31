// FootStock — POST /api/v1/admin/news/batch-resolve
// Re-resolve o ticker de todas as noticias que estao sem ticker (null ou vazio).
// Usa resolveTickerFromText (realName + coachName + aliases).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveTickerFromText } from '@/lib/utils/resolve-ticker'
import {
  decideLineAssetIds,
  siblingAssetIdsFrom,
  siblingCountFrom,
  type LineAssetIdsSkipReason,
} from '@/lib/services/newsLineAssetIds'
import type { User, AdminRole } from '@/types'

const VALID_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMINISTRADOR']

function devAuthFallback(request: NextRequest): { user: User; userId: string } | null {
  if (process.env.NODE_ENV !== 'development') return null
  const adminRole = request.cookies.get('fs-admin-role')?.value
  if (!adminRole || !VALID_ADMIN_ROLES.includes(adminRole)) return null
  return {
    user: {
      id: 'dev-user', email: 'dev@foot-stock.test', name: 'Dev User',
      phone: null, birthDate: '', favoriteClub: '', favoriteClubDisplayName: null,
      userType: 'NORMAL', investorProfile: 'INICIANTE', planType: 'JOGADOR',
      fsBalance: 0, marginBlocked: 0, tourCompleted: false, 
      adminRole: adminRole as AdminRole, version: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    userId: 'dev-user',
  }
}

export async function POST(request: NextRequest) {
  let auth = await getAuthUser()
  if (!auth) auth = devAuthFallback(request)

  if (!auth) {
    return NextResponse.json(
      { error: { code: 'AUTH-001', message: 'Não autorizado.' } },
      { status: 401 }
    )
  }
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-050', message: 'Apenas SUPER_ADMIN pode acessar.' } },
      { status: 403 }
    )
  }

  const unlinked = await prisma.news.findMany({
    where: { OR: [{ ticker: null }, { ticker: '' }] },
    // Item 019 / ST005: o select passa a trazer o estado de grupo que
    // `decideLineAssetIds` precisa (DB-19).
    select: {
      id: true,
      title: true,
      content: true,
      groupId: true,
      groupRank: true,
      assetIds: true,
    },
    take: 500,
  })

  // Item 019 / ST005 — I-leitura-de-grupo em lote: UMA consulta para todos os
  // grupos do lote, nunca uma por linha dentro do loop (o lote e `take: 500`).
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

  let resolved = 0
  let resolvedWithAsset = 0
  let noAssetMatch = 0
  let failed = 0
  let skippedGroup = 0
  const skippedByReason: Record<LineAssetIdsSkipReason, number> = {
    unchanged: 0,
    'legacy-multi-asset': 0,
    'sibling-owns-asset': 0,
    'group-row-clear': 0,
  }

  console.log(`[batch-resolve] Iniciando: ${unlinked.length} noticias sem ticker`)

  for (const news of unlinked) {
    try {
      const ticker = await resolveTickerFromText(`${news.title} ${news.content}`)
      if (ticker) {
        const asset = await prisma.asset.findUnique({
          where: { ticker },
          select: { id: true },
        })
        const assetId = asset?.id ?? null

        // Item 019 / ST005 (E7): DB-19. `where: { id }` permanece (I-linha); a
        // resolucao de ticker continua sendo o trabalho da rota, entao em skip a
        // linha grava somente `ticker`.
        //
        // `assetId` nulo NAO entra no helper: aqui "sem asset correspondente" e
        // ticker irresolvivel, nao intencao de limpar o vinculo. O comportamento
        // anterior (`...(assetId ? { assetIds: [assetId] } : {})`) omitia a coluna,
        // e converter isso em `assetIds: []` APAGARIA o vinculo de uma linha legada
        // com `ticker` nulo e `assetIds` populado — exatamente o dano que DB-19
        // proibe. So E3a (`ticker: ''` explicito no admin) limpa de proposito.
        let assetIdsData: { assetIds: string[] } | undefined
        if (assetId !== null) {
          const decision = decideLineAssetIds({
            current: {
              id: news.id,
              groupId: news.groupId,
              groupRank: news.groupRank,
              // Coalesce de fronteira: o select acima garante a coluna, mas uma
              // linha fora de contrato nao pode virar `failed++` silencioso.
              assetIds: news.assetIds ?? [],
            },
            resolvedAssetId: assetId,
            siblingAssetIds: news.groupId
              ? siblingAssetIdsFrom(siblingsByGroup.get(news.groupId) ?? [], news.id)
              : [],
            // `assetId` nunca e nulo neste ponto, entao a regra 2 (`group-row-clear`)
            // permanece inalcancavel por E7. A contagem vai declarada de todo jeito: o
            // param e obrigatorio de proposito, para nenhum chamador ficar mudo sobre o
            // estado de grupo se o caminho reabrir.
            siblingCount: news.groupId
              ? siblingCountFrom(siblingsByGroup.get(news.groupId) ?? [], news.id)
              : 0,
          })
          if (decision.action === 'write') {
            assetIdsData = { assetIds: decision.assetIds }
          } else {
            skippedGroup++
            skippedByReason[decision.reason]++
          }
        }

        await prisma.news.update({
          where: { id: news.id },
          data: {
            ticker,
            ...(assetIdsData ?? {}),
          },
        })

        // F-019-02: o snapshot de irmaos e lido UMA vez antes do loop e nao
        // enxerga as escritas do proprio loop. Duas linhas do MESMO grupo no MESMO
        // lote que resolvam para o MESMO asset gravariam ambas `[assetX]` — o
        // achatamento que o skip `sibling-owns-asset` existe para impedir, e sem
        // nenhum sinal, porque skip nenhum ocorre. Refletir a escrita no bucket
        // fecha isso para o INTRA-lote; a corrida entre dois requests simultaneos
        // e outro problema e nao se resolve aqui.
        if (assetIdsData && news.groupId) {
          const bucket = siblingsByGroup.get(news.groupId)
          if (!bucket) {
            siblingsByGroup.set(news.groupId, [{ id: news.id, assetIds: assetIdsData.assetIds }])
          } else {
            const own = bucket.find(row => row.id === news.id)
            if (own) own.assetIds = assetIdsData.assetIds
            else bucket.push({ id: news.id, assetIds: assetIdsData.assetIds })
          }
        }
        resolved++
        if (assetId) resolvedWithAsset++
        else noAssetMatch++
      }
    } catch (err) {
      failed++
      console.error(`[batch-resolve] Falha ao processar news ${news.id}: ${(err as Error).message}`)
    }
  }

  console.log(`[batch-resolve] Concluido: resolved=${resolved} with_asset=${resolvedWithAsset} no_asset=${noAssetMatch} failed=${failed} skipped_group=${skippedGroup} skipped_by_reason=${JSON.stringify(skippedByReason)}`)

  return NextResponse.json({
    data: {
      total: unlinked.length,
      resolved,
      resolved_with_asset: resolvedWithAsset,
      no_asset_match: noAssetMatch,
      remaining: unlinked.length - resolved,
      failed,
      // Item 019 / ST005: contadores NOVOS; os nomes anteriores nao mudam. Ausentes
      // quando nao houve skip, mesmo padrao do `assetIdsSkipped` das rotas PATCH: o
      // shape de 200 do caminho normal fica identico ao de antes do item 019 (o
      // contrato desta resposta e assertado por shape exaustivo em
      // tests/unit/admin/batch-resolve.test.ts). Zero Silencio nao e afetado: quando
      // ha skip, os dois campos aparecem.
      ...(skippedGroup > 0
        ? { skipped_group: skippedGroup, skipped_by_reason: skippedByReason }
        : {}),
    },
  })
}
