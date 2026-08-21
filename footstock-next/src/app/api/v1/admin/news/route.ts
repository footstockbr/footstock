import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, list, errors, parsePagination, buildPagination } from '@/lib/api'
import { resolveTickerFromText } from '@/lib/utils/resolve-ticker'
import { writeNewsGroup } from '@/lib/services/newsGroupWriter'
import type { User, AdminRole } from '@/types'
import {
  QUARANTINE_COUNT_HEADER,
  PUBLISHED_COUNT_HEADER,
  DRAFT_COUNT_HEADER,
  ARCHIVED_COUNT_HEADER,
  type AdminNewsCounts,
} from '@/lib/admin/news-counts'

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

/**
 * Quarentena editorial (T-08). Linha com `editorialBlockReason` nao nulo e o que
 * o gate do motor barrou de proposito (`motor/src/news/editorial-gate.ts`) mais o
 * passivo `backfill_no_local_team` despublicado em 2026-08-03. Ela continua
 * gravada como fila de auditoria, mas nao e conteudo: por default ela sai da
 * listagem admin e so volta com `?includeQuarantine=1`.
 *
 * Nada e apagado nem despublicado por este filtro — ele so muda o `where` do GET.
 */
const QUARANTINE_QUERY_PARAM = 'includeQuarantine'
const QUARANTINE_TRUTHY = new Set(['1', 'true', 'yes'])
const QUARANTINE_FALSY = new Set(['', '0', 'false', 'no'])

/** Contagens que a tela precisa e que nao cabem no `data`. Ficam em header de
 * proposito: o body do GET admin e um array e qualquer consumidor existente
 * continua lendo `data[]` sem mudanca de shape.
 *
 * Os tres contadores de status (T-06, criterio 3) entraram junto com a
 * paginacao: enquanto a lista era "as 100 mais recentes" o contador podia ser
 * derivado no cliente, mas com `?page=` a tela so enxerga uma pagina e contar
 * ali passou a subnotificar o operador — exatamente o sintoma que originou esta
 * task ("o contador de rascunhos fica em zero"). Contam ANCORAS e usam o MESMO
 * `anchorWhere` da listagem, entao respeitam o toggle da quarentena: com ela
 * oculta o numero e o do acervo VISIVEL, senao o rodape diria uma coisa e a
 * lista mostraria outra. */
function withCountHeaders<T extends NextResponse>(response: T, counts: AdminNewsCounts): T {
  response.headers.set(QUARANTINE_COUNT_HEADER, String(counts.quarantine))
  response.headers.set(PUBLISHED_COUNT_HEADER, String(counts.published))
  response.headers.set(DRAFT_COUNT_HEADER, String(counts.draft))
  response.headers.set(ARCHIVED_COUNT_HEADER, String(counts.archived))
  return response
}

/**
 * Query string do request sem depender de `nextUrl` estar presente: teste unitario
 * monta o request como objeto nu e o runtime entrega `nextUrl`. Extraido de
 * `readIncludeQuarantine` (T-09) porque `parsePagination` tambem precisa de um
 * `URLSearchParams` e os dois leitores tem que enxergar a MESMA query.
 * Sem query legivel devolve params vazio, nunca `null`: quem le cai no default.
 */
function readSearchParams(request: NextRequest): URLSearchParams {
  const fromNextUrl =
    (request as { nextUrl?: { searchParams?: URLSearchParams } }).nextUrl?.searchParams ?? null
  if (fromNextUrl) return fromNextUrl

  if (typeof request.url === 'string' && request.url.length > 0) {
    try {
      return new URL(request.url).searchParams
    } catch {
      // URL relativa ou vazia: cai no vazio abaixo em vez de derrubar o request.
    }
  }

  return new URLSearchParams()
}

/**
 * Valor irreconhecivel cai no default (esconder) e LOGA — Zero Silencio: o
 * operador que digitou `?includeQuarantine=sim` precisa saber por que nada mudou.
 */
function readIncludeQuarantine(request: NextRequest): boolean {
  const params = readSearchParams(request)

  const raw = params.get(QUARANTINE_QUERY_PARAM)
  if (raw === null || raw === undefined) return false

  const normalized = raw.trim().toLowerCase()
  if (QUARANTINE_TRUTHY.has(normalized)) return true
  if (QUARANTINE_FALSY.has(normalized)) return false

  console.warn(
    `[news] ${QUARANTINE_QUERY_PARAM}="${raw}" nao reconhecido; usando o default (quarentena oculta). Valores aceitos: ${[...QUARANTINE_TRUTHY].join(', ')} / ${[...QUARANTINE_FALSY].filter(Boolean).join(', ')}.`
  )
  return false
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
    // O tamanho de pagina default continua 100 de proposito: sao 100 grupos de
    // verdade, e agora com navegacao (T-09) em vez de janela fechada.
    // Sem `select`: groupId/groupRank seguem no retorno (o item 018 usa groupId no
    // data-testid do badge de grupo).
    // T-08: quarentena fora da listagem por default. O filtro e no `where` e nao
    // no cliente de proposito: com 10.872 linhas do passivo `backfill_no_local_team`
    // no acervo, filtrar depois do corte da pagina deixaria a pagina inteira
    // ocupada por linha barrada e o operador sem noticia nenhuma para editar.
    const includeQuarantine = readIncludeQuarantine(request)
    const anchorWhere = includeQuarantine
      ? { groupRank: 0 }
      : { groupRank: 0, editorialBlockReason: null }

    // T-09: paginacao por offset, com os mesmos nomes (`page`/`limit`) e o mesmo
    // leitor (`parsePagination`) que o feed publico ja usa — introduzir `pageSize`
    // so nesta rota criaria dois nomes para a mesma coisa. Default 100 = o `take`
    // que existia antes desta task, entao requisicao sem parametro devolve
    // exatamente o mesmo conjunto de antes; o cap de 100 do helper mantem o teto
    // de carga por request.
    const { page, limit, skip } = parsePagination(readSearchParams(request), 100)

    // Cinco contagens, em paralelo para nao somar mais idas ao banco em serie:
    // - `quarantineCount`: ancoras barradas, para o contador do toggle. Roda nas
    //   DUAS variantes do parametro (com zero em quarentena o valor e `0`
    //   explicito, nunca ausente). Conta ANCORAS, igual a listagem: uma noticia
    //   multi-time barrada conta 1.
    // - `total`: tamanho do acervo navegavel. Usa o MESMO `anchorWhere` do
    //   `findMany` de proposito — com a quarentena oculta o total e o numero de
    //   grupos VISIVEIS, senao a ultima pagina prometida por `totalPages` nao
    //   existiria.
    // - `published` / `draft` / `archived` (T-06, criterio 3): os mesmos tres
    //   recortes que a tela fazia no cliente, agora sobre o acervo inteiro. Os
    //   predicados sao copia literal dos filtros do header do admin
    //   (`isPublished && !isArchived`, `!isPublished && !isArchived`,
    //   `isArchived`), entao somam `total` e nao abrem uma quarta categoria
    //   invisivel. Os tres partem de `anchorWhere` pelo mesmo motivo do `total`.
    // A ordem do array e contrato com os testes existentes (quarentena primeiro,
    // total depois); campos novos entram no fim.
    // Falha em qualquer uma derruba o request inteiro por escolha: contador e
    // paginacao sao parte da mesma resposta e a tela reusa o estado de erro da
    // listagem.
    const [quarantineCount, total, publishedCount, draftCount, archivedCount] = await Promise.all([
      prisma.news.count({
        where: { groupRank: 0, editorialBlockReason: { not: null } },
      }),
      prisma.news.count({ where: anchorWhere }),
      prisma.news.count({ where: { ...anchorWhere, isPublished: true, isArchived: false } }),
      prisma.news.count({ where: { ...anchorWhere, isPublished: false, isArchived: false } }),
      prisma.news.count({ where: { ...anchorWhere, isArchived: true } }),
    ])

    const counts: AdminNewsCounts = {
      quarantine: quarantineCount,
      published: publishedCount,
      draft: draftCount,
      archived: archivedCount,
    }

    const pagination = buildPagination(page, limit, total)

    const anchors = await prisma.news.findMany({
      where: anchorWhere,
      // Admin usa createdAt desc para garantir visibilidade de rascunhos,
      // diferente do feed publico que usa publishedAt. `id` fecha a ordenacao:
      // `created_at` nao tem UNIQUE no schema e o NewsPublisher grava o grupo
      // inteiro dentro de uma transacao (CURRENT_TIMESTAMP e constante nela),
      // entao duas ancoras podem empatar no milissegundo. Sem o desempate a
      // ordem entre as empatadas fica indefinida e o mesmo grupo podia repetir
      // ou sumir entre paginas consecutivas (criterio 2 do T-09). Como `id` e
      // unico, a ordem passa a ser total. Mesmo remedio que o feed publico ja
      // aplica em src/app/api/v1/news/route.ts.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip,
      take: limit,
    })

    // Pagina fora do intervalo (`?page=999`) nao e erro: responde 200 com lista
    // vazia e o `pagination` correto, mesma semantica do feed publico. A tela usa
    // `totalPages` para nunca oferecer esse clique.
    if (anchors.length === 0) return withCountHeaders(list([], pagination), counts)

    // Hidratacao de irmaos. A lista mostra um card por FATO e precisa exibir todo
    // time envolvido com o sentimento proprio de cada um; a ancora sozinha nao diz
    // quantos times o grupo tem. Sem `isPublished` no filtro de proposito: o admin
    // enxerga rascunho e arquivada, ao contrario do feed publico.
    const groupIds = anchors.map(anchorGroupKey)
    const siblingGroupWhere = {
      OR: [
        { groupId: { in: groupIds } },
        { AND: [{ groupId: null }, { id: { in: groupIds } }] },
      ],
    }
    // Espelha o filtro da ancora tambem nos irmaos. Hoje `editorialBlockReason` e
    // uniforme por grupo (escritor unico: NewsPublisher.rowData, chamada com o
    // mesmo ctx para ancora e irmaos), entao este AND e defesa em profundidade:
    // se um dia surgir escrita por linha, o default nao passa a vazar irmao
    // barrado por baixo de uma ancora limpa.
    const siblingWhere = includeQuarantine
      ? siblingGroupWhere
      : { AND: [siblingGroupWhere, { editorialBlockReason: null }] }
    const siblingRows = (await prisma.news.findMany({
      where: siblingWhere,
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

    return withCountHeaders(list(news, pagination), counts)
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

    // T-19: normalizar ticker para uppercase (simetrico ao PATCH e aos additionalTeams).
    const normalizedTickerInput = ticker ? ticker.toUpperCase() : ''

    // Auto-detect ticker from title+content when not explicitly provided
    let resolvedTicker = normalizedTickerInput || null
    if (!resolvedTicker && (title || content)) {
      const detected = await resolveTickerFromText(`${title} ${content}`)
      resolvedTicker = detected ? detected.toUpperCase() : null
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

    // T-19: ticker fornecido explicitamente que nao corresponde a nenhum Asset -> 422 NEWS-004.
    // Simetrico ao PATCH ([id]/route.ts). Ticker auto-detectado nao entra neste gate
    // (best-effort: o usuario nao pediu esse ticker especificamente).
    if (normalizedTickerInput && resolvedAssetId === null) {
      return NextResponse.json(
        {
          error: {
            code: 'NEWS-004',
            message: 'Ticker invalido: nenhum ativo corresponde a este ticker.',
          },
        },
        { status: 422 }
      )
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
