// ============================================================================
// FootStock — /api/v1/admin/news/editorial/[id]
// Atualização e exclusão de notícia editorial no painel admin.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { NEWS_STATUS } from '@/lib/enums'
import { resolveTickerFromTitle } from '@/lib/utils/resolve-ticker'
import {
  decideLineAssetIds,
  siblingAssetIdsFrom,
  siblingCountFrom,
  type LineAssetIdsSkipReason,
  type NewsLineAssetContext,
} from '@/lib/services/newsLineAssetIds'

const patchSchema = z
  .object({
    title: z.string().min(5).max(255).optional(),
    content: z.string().min(10).max(4000).optional(),
    impact: z.enum(['FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR']).optional(),
    sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
    ticker: z.string().min(2).max(5).optional(),
    source: z.string().max(255).nullable().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  })
  .refine(
    data =>
      Boolean(
        data.title ??
          data.content ??
          data.impact ??
          data.sentiment ??
          data.ticker ??
          data.source ??
          data.status
      ),
    { message: 'Nenhum campo para atualizar.' }
  )

// `existingPublishedAt` é a data já gravada (ou null). Preserva-se a data de
// publicação ORIGINAL: publicar carimba só na primeira vez; arquivar não mexe em
// publishedAt (apenas oculta). Antes, qualquer transição sobrescrevia a data,
// destruindo o histórico de auditoria.
function statusToPersist(
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
  existingPublishedAt: Date | null,
) {
  if (status === NEWS_STATUS.PUBLISHED) {
    return { isPublished: true, publishedAt: existingPublishedAt ?? new Date() }
  }
  if (status === NEWS_STATUS.ARCHIVED) {
    return { isPublished: false } // preserva publishedAt original
  }
  return { isPublished: false, publishedAt: null } // DRAFT: volta a rascunho
}

function extractNewsId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  return segments[segments.length - 1] ?? ''
}

// Item 017 / DB-07: esta rota e a superficie de LINHA. So o par (ticker, sentiment)
// passa. Todo campo abaixo e de GRUPO e so pode ser editado por
// PATCH /api/v1/admin/news/[id]. `status` entra na lista porque `statusToPersist`
// e o unico caminho de publicar/arquivar/rascunhar daqui — e portanto o lever de
// arquivamento que o criterio 23 proibe nesta superficie.
const GROUP_ONLY_FIELDS = ['title', 'content', 'impact', 'source', 'status'] as const

// Item 017 / ST006: sinal obrigatorio (Zero Silencio) quando uma escrita que deveria
// ter escopo de grupo cai para escopo de linha por group_id nulo.
function logGroupScopeFallback(route: string, newsId: string) {
  console.warn('admin_news_group_scope_fallback', {
    route,
    newsId,
    reason: 'null_group_id',
  })
}

async function patchHandler(req: NextRequest) {
  const id = extractNewsId(req)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Dados inválidos.' }, { status: 422 })
  }

  const payload = parsed.data

  // Item 017 / ST005 — criterio 23: edicao individual e restrita a (ticker,
  // sentiment). Campo editorial vem com 422 nomeando o que foi rejeitado e apontando
  // a rota correta (Zero Silencio). Os campos continuam no patchSchema de proposito:
  // rejeitar no handler produz erro informativo, remove-los devolveria o
  // "Dados inválidos." generico do parse.
  const rejectedFields = GROUP_ONLY_FIELDS.filter(field => payload[field] !== undefined)
  if (rejectedFields.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Edicao individual e restrita a ticker e sentimento da linha. Edite titulo, conteudo ou arquivamento pela rota de grupo.',
        fields: rejectedFields,
      },
      { status: 422 }
    )
  }

  // Item 019 / ST004: UMA leitura de contexto por request. Ela substitui os dois
  // findUnique pontuais que existiam aqui (guarda de fonte externa e bloco
  // `status`) e ainda entrega o estado de grupo que `decideLineAssetIds` precisa
  // em E5 e E6. Fica DEPOIS do 422 de campo de grupo de proposito: payload
  // rejeitado nao paga leitura.
  const existing = await prisma.news.findUnique({
    where: { id },
    select: {
      groupId: true,
      groupRank: true,
      assetIds: true,
      source: true,
      publishedAt: true,
      ticker: true,
      title: true,
    },
  })

  // Enforce immutability: external-source news cannot have title/content edited.
  // Item 017: inalcancavel desde ST005 (title/content ja param no 422 acima).
  // Mantido como defesa em profundidade — remover seria mudanca de contrato fora do
  // pedido deste item. Item 019: passou a ler do contexto acima, nao de um
  // findUnique proprio.
  if (payload.title !== undefined || payload.content !== undefined) {
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Noticia nao encontrada.' }, { status: 404 })
    }
    if (existing.source) {
      return NextResponse.json(
        { success: false, error: 'Noticias de fontes externas nao podem ter titulo ou conteudo editado.' },
        { status: 403 }
      )
    }
  }

  // Item 019 / ST004 — I-leitura-de-grupo: UMA consulta de irmaos por request,
  // memoizada, compartilhada por E5 e E6. `groupId` nulo (ou linha ja removida) =
  // sem irmaos conhecidos, caminho de linha unica, com o fallback registrado.
  const lineAssetContext: NewsLineAssetContext = {
    id,
    groupId: existing?.groupId ?? null,
    groupRank: existing?.groupRank ?? null,
    assetIds: existing?.assetIds ?? [],
  }
  // Recovery do review do item 019: mesma mudanca da rota de grupo — a closure devolve
  // `assetIds` dos irmaos E a contagem de irmaos vivos, da mesma consulta unica.
  let siblingStateCache: { assetIds: string[]; count: number } | null = null
  const readSiblingState = async (): Promise<{ assetIds: string[]; count: number }> => {
    if (siblingStateCache !== null) return siblingStateCache
    const groupId = existing?.groupId
    if (!groupId) {
      logGroupScopeFallback('admin/news/editorial/[id]#PATCH:assetIds', id)
      siblingStateCache = { assetIds: [], count: 0 }
      return siblingStateCache
    }
    const siblings = await prisma.news.findMany({
      where: { groupId, NOT: { id } },
      select: { id: true, assetIds: true },
    })
    siblingStateCache = {
      assetIds: siblingAssetIdsFrom(siblings, id),
      count: siblingCountFrom(siblings, id),
    }
    return siblingStateCache
  }
  let assetIdsSkipped: LineAssetIdsSkipReason | null = null

  // Item 017 / ST005: apos o gate 422 acima, so `ticker` e `sentiment` chegam aqui.
  // As atribuicoes de title/content/impact/source/status ficaram inalcancaveis de
  // proposito — o runbook proibe remove-las neste item (contrato do payload segue
  // igual; quem muda o contrato e o item 019).
  const data: Record<string, unknown> = {}

  if (payload.title !== undefined) data.title = payload.title
  if (payload.content !== undefined) data.content = payload.content
  if (payload.impact !== undefined) data.impact = payload.impact as import('@prisma/client').ImpactCategory
  if (payload.sentiment !== undefined) data.sentiment = payload.sentiment as import('@prisma/client').Sentiment
  if (payload.source !== undefined) data.source = payload.source

  if (payload.ticker) {
    const asset = await prisma.asset.findUnique({
      where: { ticker: payload.ticker.toUpperCase() },
      select: { id: true },
    })
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Ticker inválido.' }, { status: 422 })
    }
    // BUGFIX 2026-06-23: gravar a coluna ticker junto de assetIds (antes só
    // assetIds era atualizado → ticker/assetIds desincronizavam, badge "Sem time").
    data.ticker = payload.ticker.toUpperCase()
    // Item 019 / ST004 (E5): DB-19. O `ticker` da linha continua sendo escrito em
    // skip (par ticker/sentimento e da linha, item 017); so `assetIds` fica de fora.
    const siblingState = await readSiblingState()
    const decision = decideLineAssetIds({
      current: lineAssetContext,
      resolvedAssetId: asset.id,
      siblingAssetIds: siblingState.assetIds,
      siblingCount: siblingState.count,
    })
    if (decision.action === 'write') {
      data.assetIds = decision.assetIds
    } else {
      assetIdsSkipped = decision.reason
      if (decision.reason === 'group-row-clear') {
        // Guarda defensiva, hoje inalcancavel por AQUI: `patchSchema` exige
        // `ticker` com min(2) e o 422 de ticker invalido roda antes, entao
        // `resolvedAssetId` nunca e nulo neste ponto e o helper nao produz
        // `group-row-clear`. Existe porque o criterio 4 pede a recusa nesta
        // superficie e porque reabrir a limpeza de vinculo (payload `ticker: null`)
        // e mudanca de schema, nao de comportamento.
        // Formato de erro desta rota e `{ success: false, error: string }`, nao o
        // `errors.*`/`code` da rota de grupo. Item 019 nao unifica os dois (finding
        // herdado de 017).
        return NextResponse.json(
          {
            success: false,
            error:
              'Linha pertence a grupo multi-time: limpar o vinculo de time deixaria o grupo mutilado. Edite o grupo ou remova o irmao primeiro.',
          },
          { status: 422 }
        )
      }
    }
  }

  // Item 017: bloco inalcancavel desde ST005 (`status` retorna 422 acima). Nao
  // removido de proposito — o mesmo fallback de publicacao continua ATIVO na rota de
  // grupo (`admin/news/[id]`). Codigo morto consciente; a remocao e decisao do item
  // 018/020, nao deste.
  if (payload.status) {
    // Item 019 / ST004: `current` passou a ser a leitura de contexto unica do topo
    // do handler (antes era um findUnique proprio daqui).
    const current = existing
    Object.assign(data, statusToPersist(payload.status, current?.publishedAt ?? null))

    // Fallback de publicação: ao PUBLICAR uma notícia ainda "sem time" (e sem
    // ticker sendo definido neste PATCH), tenta resolver pelo título antes de ir
    // ao ar. Determinístico e precision-first (não move preço: relevance fica a
    // cargo do fluxo de injeção, não deste handler).
    if (
      payload.status === 'PUBLISHED' &&
      data.ticker === undefined &&
      !current?.ticker &&
      current?.title
    ) {
      const resolved = await resolveTickerFromTitle(current.title)
      if (resolved) {
        const asset = await prisma.asset.findUnique({
          where: { ticker: resolved },
          select: { id: true },
        })
        // Item 019 / ST004 (E6): DB-19 aplicado mesmo com o bloco inalcancavel — o
        // codigo e morto por gate de payload (`status` -> 422 no ST005 do item 017),
        // nao por design, e o item 020 pode reabri-lo. Em skip, `ticker` tambem NAO
        // e escrito (dessincronia do BUGFIX 2026-06-23), no mesmo padrao de E3b.
        const siblingState = await readSiblingState()
        const decision = decideLineAssetIds({
          current: lineAssetContext,
          resolvedAssetId: asset?.id ?? null,
          siblingAssetIds: siblingState.assetIds,
          siblingCount: siblingState.count,
        })
        if (decision.action === 'write') {
          data.ticker = resolved
          if (asset) data.assetIds = decision.assetIds
        } else {
          assetIdsSkipped = decision.reason
        }
      }
    }
  }

  try {
    const updated = await prisma.news.update({
      where: { id },
      data,
      select: { id: true },
    })
    // Item 019 / ST004: skip de `assetIds` e observavel (criterio 5). Campo ausente
    // no caminho normal, para nao mudar o shape de 200 quando nao houve skip.
    return NextResponse.json({
      success: true,
      data: updated,
      ...(assetIdsSkipped ? { assetIdsSkipped } : {}),
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Notícia não encontrada.' }, { status: 404 })
  }
}

async function deleteHandler(req: NextRequest) {
  const id = extractNewsId(req)
  try {
    // Soft delete: arquiva a notícia em vez de remover fisicamente do banco.
    // Item 017 / ST006: por ser ARQUIVAMENTO (nao DELETE fisico), tem escopo de grupo
    // — criterio 22. O DELETE fisico por grupo (DB-23, criterio 39) e do item 020.
    //
    // O sinal de arquivamento e a coluna `isArchived`, NAO a ausencia de
    // `isPublished`. Desde o gate editorial existe uma terceira combinacao
    // legitima — isPublished=false E isArchived=false — que e a linha bloqueada
    // por escopo, e ela NAO e arquivo. Gravar so `isPublished: false` aqui
    // deixava a linha invisivel para `GET ...?status=ARCHIVED` (que filtra por
    // `isArchived: true`) e a fazia reaparecer como DRAFT. Mesma forma de escrita
    // do caminho canonico `PATCH /api/v1/admin/news/[id] { isArchived: true }`.
    const existing = await prisma.news.findUnique({
      where: { id },
      select: { groupId: true },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Notícia não encontrada.' }, { status: 404 })
    }
    // updateMany nao lanca P2025, entao o 404 vem do findUnique acima.
    if (!existing.groupId) {
      logGroupScopeFallback('admin/news/editorial/[id]#DELETE', id)
    }
    const archived = await prisma.news.updateMany({
      where: existing.groupId ? { groupId: existing.groupId } : { id },
      data: { isPublished: false, isArchived: true, archivedAt: new Date() },
    })
    return NextResponse.json({
      success: true,
      data: { id, groupAffected: archived.count },
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Notícia não encontrada.' }, { status: 404 })
  }
}

// RESOLVED: EDITOR pode arquivar via PATCH (news:write) mas não pode DELETE (news:delete).
// Arquivamento = PATCH /api/v1/admin/news/[id] { isArchived: true } — rota de GRUPO,
// permitida a EDITOR por hasAdminRole(auth.user.adminRole, 'EDITOR'). Item 017 / ST005
// passou a rejeitar PATCH { status: 'ARCHIVED' } NESTA rota com 422; a capacidade do
// EDITOR nao mudou, mudou a rota que a exerce.
// Exclusão permanente = DELETE, apenas SUPER_ADMIN/ADMIN.
export const PATCH = withAdmin('news:write')(patchHandler)
export const DELETE = withAdmin('news:delete')(deleteHandler)
