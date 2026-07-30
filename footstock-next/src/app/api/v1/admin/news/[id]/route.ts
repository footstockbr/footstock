import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { resolveTickerFromTitle } from '@/lib/utils/resolve-ticker'
import {
  decideLineAssetIds,
  siblingAssetIdsFrom,
  siblingCountFrom,
  type LineAssetIdsSkipReason,
  type NewsLineAssetContext,
} from '@/lib/services/newsLineAssetIds'
import type { User, AdminRole } from '@/types'

const patchSchema = z
  .object({
    title: z.string().min(5).max(255).optional(),
    content: z.string().min(10).max(4000).optional(),
    impact: z.enum(['FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR']).optional(),
    sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
    ticker: z.string().max(5).optional(),
    // Item 017 / ST002: `source` passa a ser editavel AQUI (superficie de grupo).
    // A rota de linha (`editorial/[id]`) responde 422 para ele, entao sem esta
    // linha o campo ficaria ineditavel em todo o admin. Mesmo shape da rota
    // editorial. Nao confundir com a imutabilidade de fonte externa (NEWS-002):
    // aquela guarda title/content de noticia que TEM source, nao a edicao do
    // proprio source.
    source: z.string().max(255).nullable().optional(),
    isPublished: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine(
    data => Object.values(data).some(v => v !== undefined),
    { message: 'Nenhum campo para atualizar.' }
  )

const VALID_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MODERADOR', 'EDITOR', 'MONITOR', 'CLUB_PARTNER']

function getDevAuthFromCookie(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return null
  const adminRole = request.cookies.get('fs-admin-role')?.value
  if (!adminRole) return null
  if (!VALID_ADMIN_ROLES.includes(adminRole)) return null
  const dummyUser: User = {
    id: 'dev-user',
    email: 'dev@foot-stock.test',
    name: 'Dev User',
    phone: null,
    birthDate: '',
    favoriteClub: '',
    favoriteClubDisplayName: null,
    userType: 'NORMAL',
    investorProfile: 'INICIANTE',
    planType: 'JOGADOR',
    fsBalance: 0,
    marginBlocked: 0,
    tourCompleted: false,
    adminRole: adminRole as AdminRole,
    version: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return { user: dummyUser, userId: 'dev-user' }
}

interface NewsParams {
  params: Promise<{ id: string }>
}

type NewsGroupContext = {
  groupId: string | null
  groupRank: number | null
  publishedAt: Date | null
}

// Item 017 / ST003: a autoridade sobre "ja foi publicado uma vez" e a ancora do
// grupo (group_rank 0). A linha editada pode ser um irmao. Sem grupo — ou quando a
// propria linha e a ancora — a resposta e a propria linha.
async function resolveAnchor<T extends NewsGroupContext>(
  row: T
): Promise<{ publishedAt: Date | null }> {
  if (!row.groupId || row.groupRank === 0) return row
  const anchor = await prisma.news.findFirst({
    where: { groupId: row.groupId, groupRank: 0 },
    select: { publishedAt: true },
  })
  return anchor ?? row
}

// Item 017 / ST006: sinal obrigatorio (Zero Silencio) quando uma escrita que deveria
// ter escopo de grupo cai para escopo de linha por group_id nulo. Sem ele o
// achatamento do grupo e invisivel para a metrica.
function logGroupScopeFallback(route: string, newsId: string) {
  console.warn('admin_news_group_scope_fallback', {
    route,
    newsId,
    reason: 'null_group_id',
  })
}

export async function PATCH(request: NextRequest, { params }: NewsParams) {
  const { id } = await params
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-051', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation('JSON invalido.')
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation('Dados invalidos.')
  }

  try {
    const { title, content, impact, sentiment, ticker, source, isPublished, isArchived } = parsed.data

    // Item 017 / ST002: UM findUnique por request. Ele substitui os dois pontuais que
    // existiam aqui (guarda de fonte externa e leitura de publishedAt) e ainda resolve
    // o grupo da linha, que e o que da escopo as escritas abaixo.
    const existing = await prisma.news.findUnique({
      where: { id },
      select: {
        groupId: true,
        groupRank: true,
        source: true,
        publishedAt: true,
        ticker: true,
        title: true,
        // Item 019 / ST003: `assetIds` entra no select que JA existe, em vez de
        // uma leitura nova. `decideLineAssetIds` precisa do estado atual da linha
        // para nao achatar acervo pre-M067 (DB-19 clausula 1).
        assetIds: true,
      },
    })
    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NEWS-001', message: 'Noticia nao encontrada' } },
        { status: 404 }
      )
    }

    // Enforce immutability: external-source news cannot have title/content edited.
    // Regra anterior ao grupo, nao revogada por nenhuma decisao DB.
    if ((title !== undefined || content !== undefined) && existing.source) {
      return NextResponse.json(
        { error: { code: 'NEWS-002', message: 'Noticias de fontes externas nao podem ter titulo ou conteudo editado.' } },
        { status: 403 }
      )
    }

    // DB-07: esta rota e a superficie de GRUPO. Campo editorial aplica ao grupo
    // inteiro; o par (ticker, sentiment) e da linha.
    //   groupData: title, content, impact, source, isPublished, publishedAt,
    //              isArchived, archivedAt
    //   lineData:  ticker, sentiment, assetIds
    // `impact` e `source` sao fato de grupo porque o publisher grava os dois iguais
    // em todas as linhas (NewsPublisher.rowData:496,500) — divergir por PATCH admin
    // quebraria o criterio 3.
    const groupData: Record<string, unknown> = {}
    const lineData: Record<string, unknown> = {}

    // Item 019 / ST003 — I-leitura-de-grupo: UMA consulta de irmaos por request,
    // memoizada. E3a (sync por ticker) e E3b (fallback de publicacao) sao
    // mutuamente exclusivos no mesmo request (`lineData.ticker === undefined` no
    // gate de E3b), mas a leitura tem que existir antes dos dois e nao pode
    // multiplicar. `groupId` nulo = sem irmaos conhecidos: cai no caminho de linha
    // unica e registra o fallback (mesmo padrao do item 017).
    const lineAssetContext: NewsLineAssetContext = {
      id,
      groupId: existing.groupId,
      groupRank: existing.groupRank,
      // Coalesce de fronteira: o select acima garante a coluna; uma linha fora de
      // contrato nao pode derrubar o PATCH com TypeError dentro do try/catch.
      assetIds: existing.assetIds ?? [],
    }
    // Recovery do review do item 019: a closure passa a devolver TAMBEM a contagem de
    // irmaos vivos. `assetIds` de irmao nao serve de proxy de existencia de irmao
    // (irmao com `assetIds: []` desaparece no achatamento) e o criterio 4 fala de
    // irmao vivo. Os dois sinais saem da MESMA consulta (I-leitura-de-grupo).
    let siblingStateCache: { assetIds: string[]; count: number } | null = null
    const readSiblingState = async (): Promise<{ assetIds: string[]; count: number }> => {
      if (siblingStateCache !== null) return siblingStateCache
      if (!existing.groupId) {
        logGroupScopeFallback('admin/news/[id]#PATCH:assetIds', id)
        siblingStateCache = { assetIds: [], count: 0 }
        return siblingStateCache
      }
      const siblings = await prisma.news.findMany({
        where: { groupId: existing.groupId, NOT: { id } },
        select: { id: true, assetIds: true },
      })
      siblingStateCache = {
        assetIds: siblingAssetIdsFrom(siblings, id),
        count: siblingCountFrom(siblings, id),
      }
      return siblingStateCache
    }
    // Zero Silencio: skip de `assetIds` nunca e silencioso — vira campo na resposta.
    let assetIdsSkipped: LineAssetIdsSkipReason | null = null

    if (title !== undefined) groupData.title = title
    if (content !== undefined) groupData.content = content
    if (impact !== undefined) groupData.impact = impact
    if (source !== undefined) groupData.source = source
    if (sentiment !== undefined) lineData.sentiment = sentiment
    if (ticker !== undefined) {
      lineData.ticker = ticker || null
      // ADR Opcao A (blacksmith/adr/adr-news-ticker-assetids-sync.md): manter ticker e assetIds sincronizados em updates
      let resolvedAssetId: string | null = null
      if (ticker) {
        const asset = await prisma.asset.findUnique({
          where: { ticker },
          select: { id: true },
        })
        resolvedAssetId = asset?.id ?? null
      }
      // Item 019 / ST003 (E3a, ambos os ramos): DB-19. A substituicao cega por
      // `[asset.id]` achatava o grupo quando o asset e de um irmao, e o ramo de
      // ticker vazio apagava o vinculo de uma linha com irmaos vivos.
      const siblingState = await readSiblingState()
      const decision = decideLineAssetIds({
        current: lineAssetContext,
        resolvedAssetId,
        siblingAssetIds: siblingState.assetIds,
        siblingCount: siblingState.count,
      })
      if (decision.action === 'write') {
        lineData.assetIds = decision.assetIds
      } else {
        assetIdsSkipped = decision.reason
        if (decision.reason === 'group-row-clear') {
          // 422 ANTES de abrir a transacao de escrita: nada e gravado, nem
          // `ticker`, nem `groupData`. `NEWS-003` estava livre (namespace atual:
          // NEWS-001, NEWS-002).
          return NextResponse.json(
            {
              error: {
                code: 'NEWS-003',
                message:
                  'Linha pertence a grupo multi-time: limpar o vinculo de time deixaria o grupo mutilado. Edite o grupo ou remova o irmao primeiro.',
              },
            },
            { status: 422 }
          )
        }
        // Nos demais skips `lineData.ticker` CONTINUA sendo escrito: o par
        // (ticker, sentiment) e da linha, decisao do item 017. So `assetIds` fica
        // de fora, e o motivo vai na resposta.
      }
    }
    if (isArchived !== undefined) {
      // Criterio 22 + criterio 14: arquivar um irmao arquiva o grupo, senao a ancora
      // arquivada fica com irmaos vivos (grupo fantasma). Com updateMany todas as
      // linhas recebem o MESMO archivedAt na mesma escrita.
      groupData.isArchived = isArchived
      if (isArchived) groupData.archivedAt = new Date()
      // Desarquivar tambem e de grupo. archivedAt nao e limpo — o codigo anterior
      // tambem nao limpava e mudar isso nao esta pedido neste item.
    }
    if (isPublished !== undefined) {
      groupData.isPublished = isPublished
      if (isPublished) {
        // Só carimba publishedAt na PRIMEIRA publicação. Preserva a data original
        // em republicações/edições — antes `!updateData.publishedAt` era sempre true
        // (objeto local recém-criado) e sobrescrevia a data histórica a cada PATCH.
        // Com fan-out, a autoridade sobre "primeira vez" e a ANCORA do grupo
        // (groupRank 0), nao a linha editada. O publisher garante publishedAt
        // identico no grupo (criterio 1), entao os valores coincidem; ler da ancora
        // deixa explicito quem manda.
        const anchor = await resolveAnchor(existing)
        if (!anchor.publishedAt) {
          groupData.publishedAt = new Date()
        }
        // Fallback de publicação (gatilho "sem time"): publicar uma notícia sem
        // ticker — e sem ticker sendo definido neste PATCH — dispara a resolução
        // determinística pelo título antes de ir ao ar. Continua sendo escrita de
        // LINHA: publicar o grupo nao pode carimbar o ticker da ancora nos irmaos.
        if (lineData.ticker === undefined && !existing.ticker && existing.title) {
          const resolved = await resolveTickerFromTitle(existing.title)
          if (resolved) {
            const asset = await prisma.asset.findUnique({
              where: { ticker: resolved },
              select: { id: true },
            })
            // Item 019 / ST003 (E3b): DB-19. O caso real aqui e
            // `sibling-owns-asset` — publicar um grupo cuja ancora esta "sem time"
            // nao pode carimbar nela o time de um irmao. Em skip, `ticker` TAMBEM
            // fica de fora: ticker sem asset correspondente reintroduz a
            // dessincronia do BUGFIX 2026-06-23. Sem 422 aqui: recusar a
            // publicacao do grupo por causa do fallback seria outra decisao de
            // contrato (o 422 e do ramo de limpeza explicita, E3a).
            const siblingState = await readSiblingState()
            const decision = decideLineAssetIds({
              current: lineAssetContext,
              resolvedAssetId: asset?.id ?? null,
              siblingAssetIds: siblingState.assetIds,
              siblingCount: siblingState.count,
            })
            if (decision.action === 'write') {
              lineData.ticker = resolved
              lineData.assetIds = decision.assetIds
            } else {
              assetIdsSkipped = decision.reason
            }
          }
        }
      }
    }

    const hasLineData = Object.keys(lineData).length > 0
    const hasGroupData = Object.keys(groupData).length > 0

    // group_id nulo (linha legacy que escapou do trigger news_group_defaults_trg):
    // cair para escopo de linha. Nao inventar grupo, nao abortar — mas registrar.
    const groupWhere = existing.groupId ? { groupId: existing.groupId } : { id }
    if (hasGroupData && !existing.groupId) {
      logGroupScopeFallback('admin/news/[id]#PATCH', id)
    }

    // As duas escritas na MESMA request tem que ser atomicas: um PATCH com title
    // (grupo) e sentiment (linha) nao pode terminar com metade aplicada.
    const ops: Prisma.PrismaPromise<unknown>[] = []
    let lineOpIndex = -1
    if (hasLineData) {
      lineOpIndex = ops.length
      ops.push(prisma.news.update({ where: { id }, data: lineData }))
    }
    let groupOpIndex = -1
    let readIndex = -1
    if (hasGroupData) {
      groupOpIndex = ops.length
      ops.push(prisma.news.updateMany({ where: groupWhere, data: groupData }))
      // O `update` da linha roda ANTES do fan-out, entao a linha que ele devolve
      // esta desatualizada. So uma leitura depois do updateMany — e dentro da mesma
      // transacao — reflete o que o admin acabou de gravar no grupo.
      readIndex = ops.length
      ops.push(prisma.news.findUnique({ where: { id } }))
    }

    const results = (await prisma.$transaction(ops)) as unknown[]

    const news = readIndex >= 0 ? results[readIndex] : results[lineOpIndex]
    // Numero de linhas que a escrita de grupo tocou; alimenta o
    // admin-noticias-group-scope-warning do item 018. Sem escrita de grupo, a
    // request tocou exatamente a linha editada.
    const groupAffected =
      groupOpIndex >= 0
        ? (results[groupOpIndex] as { count?: number } | undefined)?.count ?? 0
        : 1

    // Correcao pos-auditoria do item 017: `updateMany` nao lanca P2025 e o
    // findUnique de escopo roda ANTES da transacao. Sem esta guarda, uma remocao
    // concorrente entre a leitura e a escrita devolvia 200 com groupAffected 0 e
    // corpo vazio, em vez do 404 NEWS-001 que o caminho de linha ja dava via P2025.
    if (!news || (groupOpIndex >= 0 && groupAffected === 0)) {
      return NextResponse.json(
        { error: { code: 'NEWS-001', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }

    // Item 019 / ST003: skip de `assetIds` e observavel (criterio 5). Ausente
    // quando nao houve skip, para nao mudar o shape de 200 no caminho normal.
    return ok({
      ...(news as Record<string, unknown>),
      groupAffected,
      ...(assetIdsSkipped ? { assetIdsSkipped } : {}),
    })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'NEWS-001', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }
    console.error('[news] Error:', error)
    return errors.server()
  }
}

export async function DELETE(request: NextRequest, { params }: NewsParams) {
  const { id } = await params
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-051', message: 'Apenas super admin pode deletar notícias.' } },
      { status: 403 }
    )
  }

  try {
    // Item 020 / ST003 — DB-23 (source.md:1105) + criterio 22: "DELETE ou
    // arquivamento afeta o grupo inteiro". Ramo adotado: apaga o grupo inteiro, nao
    // "recusa quando houver irmaos vivos" — o GET admin lista apenas ancoras
    // (groupRank 0, item 017), entao recusar seria oferecer na tela uma acao que
    // nunca completa. Delete continua FISICO: DB-23 proibe soft delete explicitamente.
    //
    // A leitura previa nao e conveniencia: `deleteMany` nao lanca P2025 e devolveria
    // `{ count: 0 }` com HTTP 200, a mesma armadilha que o item 017 corrigiu no
    // PATCH (`:365-372`). Sem ela nao existe 404 confiavel.
    const existing = await prisma.news.findUnique({
      where: { id },
      select: { id: true, groupId: true },
    })
    if (!existing) {
      return NextResponse.json(
        { error: { code: 'NEWS-001', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }

    // Espelho literal do `groupWhere` do PATCH (`:329`). Pos-M067 o ramo de
    // fallback e quase codigo morto (o trigger preenche `group_id := id`), e
    // permanece por paridade e por `String?` no Prisma — para noticia de time unico
    // `groupId === id`, logo o deleteMany apaga exatamente 1 linha, que e o
    // comportamento correto. Uma unica operacao atomica no banco: sem transacao, e
    // sem risco de P2003 porque nenhum model referencia `News` (F-020-11).
    const groupWhere = existing.groupId ? { groupId: existing.groupId } : { id }
    if (!existing.groupId) {
      logGroupScopeFallback('admin/news/[id]#DELETE', id)
    }

    const { count: deletedCount } = await prisma.news.deleteMany({ where: groupWhere })

    return ok({ message: 'Notícia deletada com sucesso', deletedCount })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'NEWS-001', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }
    console.error('[news] Error:', error)
    return errors.server()
  }
}
