import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { resolveTickerFromText } from '@/lib/utils/resolve-ticker'
import { writeNewsGroup } from '@/lib/services/newsGroupWriter'
import type { User, AdminRole } from '@/types'

// Mensagens do grupo multi-time (M067). Ficam aqui e nao no service porque este
// POST valida `sentiment` como enum (o injetor valida como numero) e porque o
// operador ve exatamente estas frases no modal de criacao.
const GROUP_MAX_ADDITIONAL_MSG = 'Grupo de noticia aceita no maximo 3 times (1 principal + 2 adicionais).'
const GROUP_EMPTY_TICKER_MSG = 'Time adicional sem ticker. Escolha o time ou remova a linha.'
const groupDuplicateTickerMsg = (ticker: string) =>
  `Ticker repetido no grupo: ${ticker}. Cada time entra uma vez so na mesma noticia.`

/** Linha irma hidratada no GET: so o que a lista admin precisa para desenhar time+sentimento. */
interface AdminSiblingRow {
  id: string
  groupId: string | null
  groupRank: number | null
  ticker: string | null
  assetIds: string[]
  sentiment: string
  impact: string
}

/** Grupo unitario pre-backfill (item 008) nao tem group_id: o grupo e o proprio id. */
function anchorGroupKey(row: { id: string; groupId: string | null }): string {
  return row.groupId ?? row.id
}

const createSchema = z
  .object({
    title: z.string().min(5, 'Titulo deve ter pelo menos 5 caracteres').max(255),
    content: z.string().min(10, 'Conteudo deve ter pelo menos 10 caracteres').max(4000),
    impact: z.enum(['FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR']),
    sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
    ticker: z.string().max(5).optional().default(''),
    source: z.string().max(255).nullable().optional(),
    isPublished: z.boolean().optional().default(false),
    // Times adicionais do MESMO fato. Ausente ou vazio = noticia de linha unica,
    // caminho identico ao anterior a este item (criterio 17). Diferente do
    // `ticker` principal, o ticker do irmao NAO passa por auto-deteccao: o texto
    // e um so e resolveria sempre o mesmo time, o que criaria ticker repetido.
    additionalTeams: z
      .array(
        z.object({
          ticker: z.string().min(1, GROUP_EMPTY_TICKER_MSG).max(5),
          sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
        })
      )
      .max(2, GROUP_MAX_ADDITIONAL_MSG)
      .optional(),
  })
  .superRefine((data, ctx) => {
    const extra = data.additionalTeams ?? []
    if (extra.length === 0) return
    // Ticker repetido violaria o indice unico parcial por ticker (DB-05) com um
    // P2002 opaco. Comparacao case-insensitive porque este endpoint nao faz
    // upper-case no schema.
    const seen = new Set<string>()
    if (data.ticker) seen.add(data.ticker.toUpperCase())
    extra.forEach((team, index) => {
      const normalized = team.ticker.toUpperCase()
      if (seen.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['additionalTeams', index, 'ticker'],
          message: groupDuplicateTickerMsg(normalized),
        })
        return
      }
      seen.add(normalized)
    })
  })

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

export async function GET(request: NextRequest) {
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-051', message: 'Permissão insuficiente para gerenciar notícias.' } },
      { status: 403 }
    )
  }

  try {
    // Item 017 / DB-01: a listagem admin conta GRUPOS, nao linhas. Uma noticia de
    // N times sao N linhas irmas pelo group_id; so a ancora (group_rank 0) entra na
    // lista. Sem este filtro um grupo de 3 ocupa 3 dos 100 slots e a janela encolhe
    // ate 3x (RB21). Com acervo unitario pos-backfill (item 008) toda linha tem
    // group_rank 0, entao o resultado e identico ao de antes (criterio 17).
    // O `take: 100` continua o mesmo de proposito: agora sao 100 grupos de verdade.
    // Sem `select`: groupId/groupRank seguem no retorno (o item 018 usa groupId no
    // data-testid do badge de grupo).
    const anchors = await prisma.news.findMany({
      where: { groupRank: 0 },
      // Admin usa createdAt desc para garantir visibilidade de rascunhos,
      // diferente do feed publico que usa publishedAt.
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    if (anchors.length === 0) return ok([])

    // Hidratacao de irmaos. A lista mostra um card por FATO e precisa exibir todo
    // time envolvido com o sentimento proprio de cada um; a ancora sozinha nao diz
    // quantos times o grupo tem. Sem `isPublished` no filtro de proposito: o admin
    // enxerga rascunho e arquivada, ao contrario do feed publico.
    const groupIds = anchors.map(anchorGroupKey)
    const siblingRows = (await prisma.news.findMany({
      where: {
        OR: [
          { groupId: { in: groupIds } },
          { AND: [{ groupId: null }, { id: { in: groupIds } }] },
        ],
      },
      select: {
        id: true,
        groupId: true,
        groupRank: true,
        ticker: true,
        assetIds: true,
        sentiment: true,
        impact: true,
      },
      orderBy: [{ groupId: 'asc' }, { groupRank: 'asc' }],
    })) as unknown as AdminSiblingRow[]

    const byGroup = new Map<string, AdminSiblingRow[]>()
    for (const row of siblingRows) {
      const key = anchorGroupKey(row)
      const bucket = byGroup.get(key)
      if (bucket) bucket.push(row)
      else byGroup.set(key, [row])
    }
    for (const bucket of byGroup.values()) {
      bucket.sort((a, b) => (a.groupRank ?? 0) - (b.groupRank ?? 0))
    }

    // Fallback para a propria ancora: grupo cujas linhas sumiram entre as duas
    // queries continua renderizavel em vez de virar card sem time nenhum.
    const news = anchors.map((anchor) => ({
      ...anchor,
      teams: (byGroup.get(anchorGroupKey(anchor)) ?? [anchor as unknown as AdminSiblingRow]).map(
        (row) => ({
          id: row.id,
          ticker: row.ticker,
          assetIds: row.assetIds,
          sentiment: row.sentiment,
          impact: row.impact,
          groupRank: row.groupRank ?? 0,
        })
      ),
    }))

    return ok(news)
  } catch (error) {
    console.error('[news] Error:', error)
    return errors.server()
  }
}

export async function POST(request: NextRequest) {
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

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    // A mensagem generica nao serve para o grupo multi-time: "verifique titulo,
    // conteudo, impacto e sentimento" manda o operador olhar campos que estao
    // certos enquanto o erro real e a terceira linha de time. Quando existe
    // issue em `additionalTeams`, a mensagem especifica dela vence.
    const groupIssue = parsed.error.issues.find(issue => issue.path[0] === 'additionalTeams')
    return errors.validation(
      groupIssue?.message ??
        'Dados invalidos. Verifique titulo (min 5), conteudo (min 10), impacto e sentimento.'
    )
  }

  try {
    const { title, content, impact, sentiment, ticker, source, isPublished, additionalTeams } = parsed.data

    // Auto-detect ticker from title+content when not explicitly provided
    let resolvedTicker = ticker || null
    if (!resolvedTicker && (title || content)) {
      resolvedTicker = await resolveTickerFromText(`${title} ${content}`)
    }

    // ADR Opcao A (blacksmith/adr/adr-news-ticker-assetids-sync.md): resolver Asset.id para manter ticker e assetIds sincronizados
    let resolvedAssetId: string | null = null
    if (resolvedTicker) {
      const asset = await prisma.asset.findUnique({
        where: { ticker: resolvedTicker },
        select: { id: true },
      })
      resolvedAssetId = asset?.id ?? null
    }

    // Caminho de linha unica: create direto, sem transacao e sem group_id/rank —
    // o trigger `news_group_defaults_trg` preenche (DB-03). Identico ao anterior
    // a este item (criterio 17).
    if (!additionalTeams || additionalTeams.length === 0) {
      const news = await prisma.news.create({
        data: {
          title,
          content,
          impact,
          sentiment,
          ticker: resolvedTicker,
          assetIds: resolvedAssetId ? [resolvedAssetId] : [],
          source: source || null,
          isPublished,
          publishedAt: isPublished ? new Date() : null,
          author: auth.user.name,
        },
      })

      return ok(news, 201)
    }

    // ----------------------------------------------------------------------
    // Grupo multi-time: 2 ou 3 linhas irmas do mesmo fato
    // ----------------------------------------------------------------------
    // Quando o ticker principal veio de auto-deteccao, o superRefine do schema
    // nao teve como compara-lo com os irmaos (naquele momento era string vazia).
    // Recheca aqui, antes de escrever, para o operador receber 422 legivel em vez
    // de P2002 do indice unico parcial (DB-05).
    const groupTickers = new Set<string>()
    if (resolvedTicker) groupTickers.add(resolvedTicker.toUpperCase())
    for (const team of additionalTeams) {
      const normalized = team.ticker.toUpperCase()
      if (groupTickers.has(normalized)) {
        return errors.validation(groupDuplicateTickerMsg(normalized))
      }
      groupTickers.add(normalized)
    }

    // UMA instancia de publishedAt para todas as linhas: a ordenacao do feed usa
    // esse campo e recalcular por linha criaria empate instavel entre irmas.
    const groupPublishedAt = isPublished ? new Date() : null

    const rows = [
      {
        ticker: resolvedTicker,
        sentiment,
        assetIds: resolvedAssetId ? [resolvedAssetId] : [],
        rank: 0,
      },
    ]
    for (let i = 0; i < additionalTeams.length; i++) {
      const teamTicker = additionalTeams[i].ticker.toUpperCase()
      // Mesma tolerancia da ancora: ticker sem Asset correspondente grava a linha
      // com `assetIds` vazio em vez de derrubar a criacao. Este endpoint e
      // editorial e nao publica evento de motor, entao a linha sem asset e
      // apenas conteudo — diferente do `/inject`, que precisa do assetId.
      const asset = await prisma.asset.findUnique({
        where: { ticker: teamTicker },
        select: { id: true },
      })
      rows.push({
        ticker: teamTicker,
        sentiment: additionalTeams[i].sentiment,
        assetIds: asset ? [asset.id] : [],
        rank: i + 1,
      })
    }

    const { anchor } = await writeNewsGroup(rows, {
      title,
      content,
      impact,
      source: source || null,
      isPublished,
      publishedAt: groupPublishedAt,
      author: auth.user.name,
    })

    // Retorna a ancora, como no caminho de linha unica: o admin lista e edita
    // grupos pela ancora (GET filtra `groupRank: 0`).
    return ok(anchor, 201)
  } catch (error) {
    console.error('[news] Error:', error)
    return errors.server()
  }
}
