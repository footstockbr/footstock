'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { IMPACT_CATEGORY_LABELS, IMPACT_CATEGORY_OPTIONS, SENTIMENT_HEX_COLORS, SENTIMENT_LABELS, SENTIMENT_OPTIONS } from '@/lib/constants/admin-ui'
import { CLUBS_PUBLIC as CLUBS } from '@/lib/constants/clubs-public'
import {
  QUARANTINE_COUNT_HEADER,
  readAcervoCounts,
  readCountHeader,
  resolveDisplayCounts,
  type AcervoCounts,
} from '@/lib/admin/news-counts'

// Motivos de bloqueio do gate editorial do motor (`motor/src/news/editorial-gate.ts`).
// O rotulo explica o "por que" ao operador; o title traz a acao recomendada.
const EDITORIAL_BLOCK_LABELS: Record<string, { label: string; hint: string }> = {
  out_of_scope_llm: {
    label: 'FORA DE ESCOPO',
    hint: 'A IA analisou e concluiu que nenhum clube do app e afetado (outro esporte, clube estrangeiro, pessoa sem vinculo).',
  },
  no_local_team: {
    label: 'SEM TIME LOCAL',
    hint: 'A IA estava indisponivel e o resolvedor por titulo nao achou nenhum clube do app. Publique na mao se for falso-positivo.',
  },
  asset_unresolved: {
    label: 'TIME FORA DO APP',
    hint: 'Ha um clube identificado, mas ele nao existe na tabela de ativos deste app.',
  },
  out_of_scope_heuristic: {
    label: 'PAUTA FORA DE ESCOPO',
    hint: 'A IA estava indisponivel e o titulo casou uma pauta que nunca move preco (leilao, acao social, outro esporte). A mencao ao clube parece incidental.',
  },
  // Nao vem do gate ao vivo: e o passivo despublicado de uma vez em 2026-08-03,
  // quando o gate entrou. Vale a pena distinguir do `no_local_team` do motor
  // porque estas linhas nunca passaram por classificador nenhum — foram
  // avaliadas retroativamente pelo mesmo criterio (nenhum ativo local ancorado).
  backfill_no_local_team: {
    label: 'PASSIVO SEM TIME',
    hint: 'Publicada antes do gate editorial existir e despublicada na limpeza retroativa de 2026-08-03 por nao ter nenhum clube do app ancorado. Publique na mao se for falso-positivo.',
  },
}

interface NewsItem {
  id: string
  title: string
  content: string
  impact: string
  sentiment: string
  ticker: string | null
  assetIds: string[]
  source?: string | null
  isPublished: boolean
  publishedAt?: string
  isArchived: boolean
  // Gate editorial de escopo (motor). Preenchido quando o motor decidiu NAO
  // publicar: a linha e gravada mesmo assim para o operador auditar e, se for
  // falso-positivo, publicar na mao pelo botao "Publicar". `null` = passou no
  // gate. Opcional no tipo porque o acervo anterior ao gate nao tem a coluna.
  editorialBlockReason?: string | null
  clicks: number
  author: string
  createdAt: string
  updatedAt: string
  // Grupo multi-time (M067). O GET admin devolve so as ancoras
  // (`where: { groupRank: 0 }`, item 017) e nao usa `select`, entao os dois campos
  // chegam sempre. Opcionais no tipo porque acervo pre-backfill e mocks de teste
  // podem nao te-los.
  groupId?: string | null
  groupRank?: number | null
  // Linhas irmas do MESMO fato, hidratadas pelo GET admin. Uma entrada por time,
  // cada uma com o sentimento proprio daquele time (uma venda e BULLISH para quem
  // vende e BEARISH para quem compra). Sempre inclui a propria ancora. Opcional no
  // tipo porque mocks de teste e respostas antigas em cache podem nao trazer.
  teams?: NewsTeamLine[]
  // T-24b / T-23: origem do sinal e motivo de fallback. Opcionais: mocks antigos
  // e acervo pre-T-23 nao trazem os campos. Ancoras do GET saem sem `select`,
  // entao `...anchor` tambem carrega as colunas quando o client Prisma as conhece.
  origin?: string | null
  fallbackReason?: string | null
}

interface NewsTeamLine {
  id: string
  ticker: string | null
  assetIds: string[]
  sentiment: string
  impact: string
  groupRank: number
  origin?: string | null
  fallbackReason?: string | null
}

type FilterType = 'todas' | 'publicada' | 'rascunho' | 'arquivada'

/** Espelha o `limit` default do GET /api/v1/admin/news (T-09). Deixou de ser um
 * teto de janela: e o tamanho de pagina pedido a cada requisicao. */
const NEWS_PAGE_SIZE = 100

/** Bloco `pagination` do GET (contrato `list()` de `@/lib/api`). */
interface NewsPagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
}

/** Default usado antes da primeira resposta e quando a resposta vem sem
 * `pagination` (mock antigo, proxy). Nunca `undefined` no render. */
const EMPTY_PAGINATION: NewsPagination = {
  page: 1,
  limit: NEWS_PAGE_SIZE,
  total: 0,
  totalPages: 1,
  hasNext: false,
}

/** Contrato com o GET /api/v1/admin/news (T-08): parâmetro que reexibe a
 * quarentena. Os headers de contagem vivem em `@/lib/admin/news-counts`, onde o
 * produtor da rota lê as mesmas constantes. */
const QUARANTINE_QUERY_PARAM = 'includeQuarantine'

/** Cap DB-04 do grupo: 1 time principal + 2 adicionais. */
const MAX_GROUP_TEAMS = 3

/** T-24b: rotulo do card quando o classificador caiu no fallback deterministico. */
const CLASSIFIER_FALLBACK_ORIGIN = 'classifier_fallback'
const CLASSIFIER_FALLBACK_HINT =
  'Classificacao degradada: o classificador caiu no fallback deterministico.'

interface CreateTeamRow {
  ticker: string
  sentiment: string
}

/**
 * Aviso de escopo do grupo. Um componente unico (e nao o mesmo literal repetido
 * em dois modais) para o `data-testid` aparecer uma vez so no fonte e no DOM.
 */
const GroupScopeWarning = ({ children }: { children: ReactNode }) => (
  <div
    data-testid="admin-noticias-group-scope-warning"
    style={{
      marginBottom: '16px',
      padding: '10px 14px',
      background: 'rgba(240, 185, 11, 0.06)',
      border: '1px solid rgba(240, 185, 11, 0.15)',
      borderRadius: '6px',
      color: '#F0B90B',
      fontSize: '12px',
      lineHeight: '1.5',
    }}
  >
    {children}
  </div>
)

const getSentimentColor = (sentiment: string): string => SENTIMENT_HEX_COLORS[sentiment] ?? '#F0B90B'

const getSentimentLabel = (sentiment: string): string => SENTIMENT_LABELS[sentiment] ?? sentiment

const isExternalSource = (item: NewsItem): boolean => {
  return Boolean(item.source && item.source.trim().length > 0)
}

/** Ticker -> nome exibido, para o tooltip da badge de time. */
const CLUB_NAME_BY_TICKER = new Map(CLUBS.map((c) => [c.ticker, c.displayName]))

/**
 * Linhas de time do card, sempre com pelo menos uma entrada. Grupo unitario e
 * resposta sem `teams[]` (mock ou cache antigo) caem na propria ancora, entao o
 * card nunca fica sem time nem sem sentimento.
 */
const resolveTeamLines = (item: NewsItem): NewsTeamLine[] => {
  const lines = Array.isArray(item.teams) ? item.teams : []
  if (lines.length > 0) return [...lines].sort((a, b) => a.groupRank - b.groupRank)
  return [
    {
      id: item.id,
      ticker: item.ticker,
      assetIds: item.assetIds,
      sentiment: item.sentiment,
      impact: item.impact,
      groupRank: 0,
      origin: item.origin,
      fallbackReason: item.fallbackReason,
    },
  ]
}

function resolveFallbackBadge(item: NewsItem, teamLines: NewsTeamLine[]): {
  reason: string
} | null {
  const degraded =
    teamLines.find((line) => line.origin === CLASSIFIER_FALLBACK_ORIGIN) ??
    (item.origin === CLASSIFIER_FALLBACK_ORIGIN ? item : null)
  if (!degraded) return null
  const raw = degraded.fallbackReason
  const reason = typeof raw === 'string' && raw.trim().length > 0 ? raw : CLASSIFIER_FALLBACK_HINT
  return { reason }
}

const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const dateFormatted = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const timeFormatted = date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  return `${dateFormatted} ${timeFormatted}`
}

const EMPTY_CREATE = {
  title: '',
  content: '',
  impact: 'ESPORTIVA_MAJORITARIA',
  sentiment: 'NEUTRAL',
  ticker: '',
  source: '',
  isPublished: false,
  // Times adicionais do MESMO fato. Vazio = notícia de linha única, payload
  // idêntico ao anterior a este item.
  additionalTeams: [] as CreateTeamRow[],
}

export default function NoticiasPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const highlightedNewsId = searchParams.get('newsId')
  const [news, setNews] = useState<NewsItem[]>([])
  const [filter, setFilter] = useState<FilterType>('todas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Erro de ação de card (publicar/arquivar/deletar). Antes era `alert()`, que o
  // Playwright não vê e o operador dispensa sem ler.
  const [actionError, setActionError] = useState<string | null>(null)
  // Feedback explícito de sucesso (Zero Silencio). Espelha actionError para o
  // caminho feliz: o operador vê confirmação visual de arquivar/desarquivar.
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  // Paginação (T-09). Antes a tela mostrava só os 100 grupos mais recentes e
  // avisava que o resto existia mas não aparecia; agora o resto é alcançável.
  // `page` é o que a tela pediu, `pagination` é o que o servidor respondeu — os
  // dois só divergem entre o clique e a chegada da resposta.
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState<NewsPagination>(EMPTY_PAGINATION)
  // O servidor sempre manda `pagination`, mas se um proxy/mock comer o bloco a
  // tela nao pode inventar um total: `false` aqui significa "so sei o que esta
  // nesta pagina", e o rotulo passa a dizer isso em vez de mentir "no acervo".
  const [paginationKnown, setPaginationKnown] = useState(true)

  // Quarentena editorial (T-08). Por default a lista NÃO traz linha barrada pelo
  // gate do motor nem o passivo `backfill_no_local_team`: o filtro é do lado do
  // servidor (`?includeQuarantine=1`), então ligar o toggle é uma nova requisição
  // e não um filtro sobre o que já veio. O contador vem da MESMA resposta (header
  // `X-Quarantine-Count`), por isso não tem `loading`/`error` próprios: ele herda
  // os desta requisição.
  const [showQuarantine, setShowQuarantine] = useState(false)
  const [quarantineCount, setQuarantineCount] = useState(0)

  // Contadores de status do acervo (T-06, criterio 3). `null` = o servidor nao
  // mandou os headers e a tela so sabe o que veio nesta pagina; o rotulo passa a
  // dizer "Nesta pagina" em vez de mentir "No acervo", mesmo contrato do
  // `paginationKnown` acima.
  const [acervoCounts, setAcervoCounts] = useState<AcervoCounts | null>(null)

  // Recorte da quarentena da resposta que JA completou. Distinto de
  // `showQuarantine` (o toggle): entre clicar e a resposta chegar, o toggle ja
  // virou e os numeros na tela ainda sao do recorte anterior; rotular pelo
  // toggle faria a tela afirmar um recorte que os numeros exibidos nao tem.
  const [countsIncludeQuarantine, setCountsIncludeQuarantine] = useState(false)

  // Edit modal
  const [editingItem, setEditingItem] = useState<NewsItem | null>(null)
  const [editForm, setEditForm] = useState({ title: '', content: '', impact: 'ESPORTIVA_MAJORITARIA', sentiment: 'NEUTRAL', ticker: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  // Quantas linhas o PATCH afetou (campo `groupAffected` da resposta, item 017).
  const [editNotice, setEditNotice] = useState<string | null>(null)

  // Create modal
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [savingCreate, setSavingCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<NewsItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    fetchNews()
  }, [])

  useEffect(() => {
    if (!highlightedNewsId || news.length === 0 || editingItem) return
    const item = news.find((candidate) => candidate.id === highlightedNewsId)
    if (!item) return
    setEditingItem(item)
    setEditForm({
      title: item.title,
      content: item.content,
      impact: item.impact,
      sentiment: item.sentiment,
      ticker: item.ticker ?? '',
    })
    setEditError(null)
    setEditNotice(null)
    // Consumir o parâmetro newsId para evitar reabertura do modal ao cancelar (T-17).
    // Sem isso, fechar o modal zera editingItem, o effect reabre porque highlightedNewsId
    // ainda está na URL, e o operador fica preso sem conseguir fechar.
    const url = new URL(window.location.href)
    url.searchParams.delete('newsId')
    router.replace(`${url.pathname}${url.search}`, { scroll: false })
  }, [highlightedNewsId, news, editingItem, router])

  const fetchNews = async (
    includeQuarantine: boolean = showQuarantine,
    targetPage: number = page
  ) => {
    try {
      setLoading(true)
      setError(null)
      const query = new URLSearchParams({
        page: String(targetPage),
        limit: String(NEWS_PAGE_SIZE),
      })
      if (includeQuarantine) query.set(QUARANTINE_QUERY_PARAM, '1')
      const res = await fetch(`/api/v1/admin/news?${query.toString()}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Erro ao carregar noticias')
      const data = await res.json()
      const payload: NewsItem[] = data.data || []

      // Contador da quarentena: header da mesma resposta. Ausente ou ilegível
      // (proxy que remove header custom, mock antigo) cai em 0 — o controle
      // continua renderizado com `0`, nunca some nem mostra vazio.
      setQuarantineCount(readCountHeader(res.headers, QUARANTINE_COUNT_HEADER) ?? 0)

      // Contadores de status do acervo (T-06, criterio 3). Tudo-ou-nada dentro
      // de `readAcervoCounts`; aqui so registramos o recorte que produziu estes
      // numeros, para o rotulo nunca descrever um recorte diferente do exibido.
      setAcervoCounts(readAcervoCounts(res.headers))
      setCountsIncludeQuarantine(includeQuarantine)

      // A rota já filtra `groupRank: 0` (item 017), então cada item aqui é UM
      // grupo, não uma linha. O filtro defensivo abaixo existe porque a lista
      // alimenta os contadores do header: se alguma vez uma linha irmã escapar
      // (backfill incompleto, rota alterada), contaríamos a mesma notícia 2 ou 3
      // vezes. Descarte é logado, nunca silencioso.
      const anchors = payload.filter((item) => item.groupRank === 0 || item.groupRank == null)
      if (anchors.length !== payload.length) {
        console.warn(
          `[admin/noticias] ${payload.length - anchors.length} linha(s) irmã(s) (groupRank > 0) vieram do GET e foram descartadas da lista. A rota deveria filtrar groupRank: 0.`
        )
      }

      setNews(anchors)

      // Bloco `pagination` da mesma resposta. Ausente (mock antigo, proxy que
      // reescreve o body) cai num default derivado da própria página e LOGA —
      // mesmo padrão do header da quarentena. Nunca `undefined` no render, nunca
      // silêncio.
      const rawPagination = (data as { pagination?: Partial<NewsPagination> }).pagination
      if (!rawPagination || typeof rawPagination.totalPages !== 'number') {
        console.warn(
          '[admin/noticias] resposta do GET sem bloco `pagination`; navegação limitada à página atual.'
        )
        // `totalPages` acompanha a pagina pedida: com o default 1 do
        // EMPTY_PAGINATION o rotulo renderizaria "Pagina 3 de 1", um estado
        // impossivel. Assim "Anterior" continua utilizavel para voltar e
        // "Proxima" fica desabilitado, que e a verdade: nao da para saber se
        // existe pagina seguinte.
        setPaginationKnown(false)
        setPagination({
          ...EMPTY_PAGINATION,
          page: targetPage,
          total: anchors.length,
          totalPages: Math.max(1, targetPage),
          hasNext: false,
        })
      } else {
        setPaginationKnown(true)
        setPagination({
          page: rawPagination.page ?? targetPage,
          limit: rawPagination.limit ?? NEWS_PAGE_SIZE,
          total: rawPagination.total ?? anchors.length,
          totalPages: Math.max(1, rawPagination.totalPages),
          hasNext: Boolean(rawPagination.hasNext),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  // Recarrega do servidor porque o filtro é do `where` do GET, não do cliente.
  // O estado só vira depois de disparar o fetch com o valor novo, então não há
  // janela em que o rótulo diz uma coisa e a lista mostra outra.
  // Volta para a página 1: ligar ou desligar a quarentena muda o tamanho do
  // acervo, então continuar na página 7 poderia cair fora do intervalo (mesmo
  // reset que `handleFilterChange` faz em `UserList.tsx`).
  const toggleQuarantine = () => {
    const next = !showQuarantine
    setShowQuarantine(next)
    setPage(1)
    fetchNews(next, 1)
  }

  // Navegação de páginas (T-09). Clamp entre 1 e `totalPages` e no-op no alvo
  // igual ao atual, então nenhum clique dispara requisição inútil nem leva a uma
  // página inexistente. O estado só vira junto com o fetch do valor novo, mesma
  // disciplina de `toggleQuarantine`.
  const goToPage = (target: number) => {
    const clamped = Math.min(Math.max(1, target), Math.max(1, pagination.totalPages))
    if (clamped === page) return
    setPage(clamped)
    fetchNews(showQuarantine, clamped)
  }

  const getFilteredNews = () => {
    return news.filter((item) => {
      if (filter === 'todas') return !item.isArchived
      if (filter === 'publicada') return item.isPublished && !item.isArchived
      if (filter === 'rascunho') return !item.isPublished && !item.isArchived
      if (filter === 'arquivada') return item.isArchived
      return true
    })
  }

  // Contadores contam GRUPOS, não linhas: `news` só tem âncoras (a rota filtra
  // `groupRank: 0` e o fetch reforça). Uma notícia de 3 times conta 1 aqui, que é
  // o que o operador vê como "uma notícia" na lista.
  //
  // Quando o servidor manda os headers de status (caso normal), os números são do
  // ACERVO e os predicados abaixo ficam como fallback — são a mesma regra, só que
  // aplicada ao recorte da página. Manter os dois cálculos com predicados
  // idênticos é o que permite trocar o rótulo sem trocar o significado.
  const pageCounts: AcervoCounts = {
    published: news.filter((n) => n.isPublished && !n.isArchived).length,
    draft: news.filter((n) => !n.isPublished && !n.isArchived).length,
    archived: news.filter((n) => n.isArchived).length,
  }
  const { counts: displayCounts, scopeLabel: countsScopeLabel } = resolveDisplayCounts({
    acervoCounts,
    pageCounts,
    includesQuarantine: countsIncludeQuarantine,
  })

  const togglePublish = async (id: string, isPublished: boolean) => {
    setActionError(null)
    setActionSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/news/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !isPublished }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message || 'Erro ao atualizar')
      fetchNews()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  const archiveNews = async (id: string) => {
    setActionError(null)
    setActionSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/news/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: true }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message || 'Erro ao arquivar')
      setActionSuccess('Notícia arquivada com sucesso.')
      fetchNews()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao arquivar')
    }
  }

  const unarchiveNews = async (id: string) => {
    setActionError(null)
    setActionSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/news/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: false }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error?.message || 'Erro ao desarquivar')
      setActionSuccess('Notícia desarquivada com sucesso.')
      fetchNews()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao desarquivar')
    }
  }

  const openDeleteModal = (item: NewsItem) => {
    setDeleteTarget(item)
    setDeleteError(null)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    setActionSuccess(null)
    try {
      const res = await fetch(`/api/v1/admin/news/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error?.message || 'Erro ao deletar')
      }
      setDeleteTarget(null)
      fetchNews()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erro ao deletar')
    } finally {
      setDeleting(false)
    }
  }

  const openEditModal = (item: NewsItem) => {
    setEditingItem(item)
    setEditForm({ title: item.title, content: item.content, impact: item.impact, sentiment: item.sentiment, ticker: item.ticker ?? '' })
    setEditError(null)
    setEditNotice(null)
  }

  const saveEdit = async () => {
    if (!editingItem) return
    setSavingEdit(true)
    setEditError(null)
    setEditNotice(null)
    try {
      const isExternal = isExternalSource(editingItem)
      // Only send title/content if news is admin-created (not external)
      const payload: Record<string, unknown> = {
        impact: editForm.impact,
        sentiment: editForm.sentiment,
      }
      // T-18 (item 019): ticker so entra no payload quando efetivamente alterado.
      // Enviar ticker inalterado (vazio para linha de grupo sem time) fazia a rota
      // tratar string vazia como intencao de limpar, retornando 422 NEWS-003 e
      // impedindo editar titulo/impacto de linha sem ticker pelo modal.
      const originalTicker = editingItem.ticker ?? ''
      if (editForm.ticker !== originalTicker) {
        payload.ticker = editForm.ticker
      }
      if (!isExternal) {
        payload.title = editForm.title
        payload.content = editForm.content
      }

      const res = await fetch(`/api/v1/admin/news/${editingItem.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Erro ao salvar')
      }
      // `groupAffected` (item 017) diz quantas linhas o PATCH tocou: 1 quando a
      // notícia é de um time só, 2 ou 3 quando é multi-time e o campo editado é
      // do grupo. Sem esse retorno o operador não tem como saber se mexeu em uma
      // linha ou no fato inteiro.
      const affected = typeof data?.data?.groupAffected === 'number' ? data.data.groupAffected : null
      setEditNotice(
        affected === null
          ? 'Notícia salva.'
          : affected > 1
            ? `Notícia salva. ${affected} linhas do grupo foram atualizadas (todos os times deste fato).`
            : 'Notícia salva. 1 linha atualizada.'
      )
      fetchNews()
      setEditingItem(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSavingEdit(false)
    }
  }

  // ---- Criação: times do grupo -------------------------------------------
  const addCreateTeam = () => {
    if (createForm.additionalTeams.length >= MAX_GROUP_TEAMS - 1) return
    setCreateError(null)
    setCreateForm({
      ...createForm,
      additionalTeams: [...createForm.additionalTeams, { ticker: '', sentiment: 'NEUTRAL' }],
    })
  }

  const removeCreateTeam = (index: number) => {
    setCreateError(null)
    setCreateForm({
      ...createForm,
      additionalTeams: createForm.additionalTeams.filter((_, i) => i !== index),
    })
  }

  const updateCreateTeam = (index: number, patch: Partial<CreateTeamRow>) => {
    setCreateError(null)
    setCreateForm({
      ...createForm,
      additionalTeams: createForm.additionalTeams.map((team, i) => (i === index ? { ...team, ...patch } : team)),
    })
  }

  const saveCreate = async () => {
    setCreateError(null)
    if (!createForm.title.trim() || !createForm.content.trim()) {
      setCreateError('Título e conteúdo são obrigatórios')
      return
    }

    // Validação local dos times adicionais: o servidor também valida e devolve
    // 422, mas errar aqui evita um round-trip e mantém o que o operador digitou.
    const extra = createForm.additionalTeams
    if (extra.some((team) => !team.ticker)) {
      setCreateError('Time adicional sem ticker. Escolha o time ou remova a linha.')
      return
    }
    const seen = new Set<string>()
    if (createForm.ticker) seen.add(createForm.ticker)
    for (const team of extra) {
      if (seen.has(team.ticker)) {
        setCreateError(`Ticker repetido no grupo: ${team.ticker}. Cada time entra uma vez só na mesma notícia.`)
        return
      }
      seen.add(team.ticker)
    }

    setSavingCreate(true)
    try {
      // Sem times adicionais o payload é exatamente o de antes deste item: nenhum
      // campo novo vai na requisição de notícia de linha única (critério 17).
      const payload: Record<string, unknown> = {
        title: createForm.title,
        content: createForm.content,
        impact: createForm.impact,
        sentiment: createForm.sentiment,
        ticker: createForm.ticker,
        source: createForm.source || null,
        isPublished: createForm.isPublished,
      }
      if (extra.length > 0) {
        payload.additionalTeams = extra.map((team) => ({ ticker: team.ticker, sentiment: team.sentiment }))
      }

      const res = await fetch('/api/v1/admin/news', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        // A mensagem do 422 é específica (ticker repetido, time sem ticker, mais
        // de 3 times) e é a única pista que o operador tem para corrigir.
        const data = await res.json().catch(() => null)
        throw new Error(data?.error?.message || 'Erro ao criar noticia')
      }
      fetchNews()
      setCreating(false)
      setCreateForm(EMPTY_CREATE)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erro ao criar')
    } finally {
      setSavingCreate(false)
    }
  }

  const filteredNews = getFilteredNews()

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: '#1E2329',
    border: '1px solid #2a2d35',
    borderRadius: '6px',
    color: 'white',
    fontSize: '14px',
    boxSizing: 'border-box' as const,
  }

  const inputDisabledStyle = {
    ...inputStyle,
    opacity: 0.5,
    cursor: 'not-allowed',
    background: '#14161a',
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    fontWeight: '600' as const,
    color: '#8f95a5',
  }

  return (
    <div data-testid="page-admin-noticias" className="fade-in" style={{ padding: '20px', color: 'white' }}>
      <style>{`
        :root {
          --bg: #1E2329;
          --accent: #F0B90B;
          --accent2: #FFC107;
          --muted: #8f95a5;
          --red: #F6465D;
          --green: #2EBD85;
          --mono: 'Courier New', monospace;
        }
        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .section-title { font-size: 20px; font-weight: 600; }
        .section-sub { font-size: 12px; color: var(--muted); }
        .filter-bar { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 1px solid #2a2d35; }
        .filter-btn { background: transparent; color: var(--muted); border: none; border-bottom: 2px solid transparent; padding: 12px 16px; cursor: pointer; font-size: 13px; transition: color 0.2s; }
        .filter-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
        .news-card { background: #181A20; border: 1px solid #2a2d35; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
        .news-card.published { border-color: #2a3d35; }
        .news-badges { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
        .badge { background: rgba(255,255,255,.08); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-block; }
        .news-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
        .news-author { font-size: 11px; color: var(--muted); }
        .news-actions { display: flex; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #2a2d35; flex-wrap: wrap; }
        .btn { padding: 8px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid; transition: all 0.2s; }
        .btn-sm { padding: 6px 10px; font-size: 11px; }
        .btn-outline { background: transparent; border-color: currentColor; }
        .btn-outline:hover { opacity: 0.8; }
        .btn-solid { border: none; }
        .btn-solid:hover { opacity: 0.8; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .modal-box { background: #181A20; border: 1px solid #2a2d35; border-radius: 8px; padding: 24px; max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto; color: white; }
      `}</style>

      <div className="section-header" data-testid="admin-noticias-header">
        <div>
          <div className="section-title">Notícias</div>
          {/* Contadores do ACERVO quando o servidor os manda (headers
              `X-{Published,Draft,Archived}-Count`), da PÁGINA quando não manda. O
              rótulo diz qual dos dois está na tela: com `?page=` a lista é uma
              página e um número de página anunciado como "acervo" subnotifica o
              operador — foi o sintoma que originou o T-06. */}
          <div className="section-sub" data-testid="admin-noticias-counters">
            {countsScopeLabel}: {displayCounts.published} publicadas · {displayCounts.draft} rascunhos · {displayCounts.archived} arquivadas
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="btn btn-sm btn-solid"
          data-testid="admin-noticias-nova-button"
          style={{ background: 'var(--accent)', color: 'var(--bg)', borderColor: 'transparent' }}
        >
          + Nova
        </button>
      </div>

      {/* Nota explicativa: injeção no motor */}
      <div
        data-testid="admin-noticias-motor-note"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
          padding: '8px 12px',
          background: 'rgba(240,185,11,.06)',
          border: '1px solid rgba(240,185,11,.15)',
          borderRadius: '8px',
          fontSize: '11px',
          color: '#929AA5',
        }}
      >
        <Lock size={12} style={{ color: '#F0B90B', flexShrink: 0 }} />
        <span>
          Para injetar uma notícia no motor de preço e disparar impacto em tempo real, use o{' '}
          <strong style={{ color: '#F0B90B' }}>Módulo Motor &gt; Notícias</strong>.
          As notícias criadas aqui ficam no feed editorial e não afetam o motor diretamente.
        </span>
      </div>

      <div className="filter-bar" data-testid="admin-noticias-filter-bar">
        {(['todas', 'publicada', 'rascunho', 'arquivada'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            data-testid={`admin-noticias-filter-${f}-button`}
            title="Filtra apenas as notícias da página atual, não o acervo inteiro."
          >
            {f === 'todas' ? 'Todas' : f === 'publicada' ? 'Publicadas' : f === 'rascunho' ? 'Rascunhos' : 'Arquivadas'}
          </button>
        ))}
        {/* As abas operam sobre o array já carregado, ou seja sobre a página
            corrente. Sem esta linha o operador leria "Rascunhos: 0" como "não há
            rascunho nenhum no acervo". */}
        <span
          data-testid="admin-noticias-filter-scope-note"
          style={{ marginLeft: '8px', alignSelf: 'center', fontSize: '11px', color: '#8f95a5' }}
        >
          Filtram apenas a página atual
        </span>
      </div>

      {/* Quarentena editorial (T-08): contador e toggle SEMPRE renderizados,
          inclusive com zero em quarentena — o `0` explícito é a informação de
          que não há passivo escondido, e suprimir o controle deixaria o operador
          sem saber que o filtro existe. */}
      <div
        data-testid="admin-noticias-quarantine-control"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px',
          padding: '8px 12px',
          background: '#181A20',
          border: '1px solid #2a2d35',
          borderRadius: '6px',
          fontSize: '12px',
          color: '#8f95a5',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showQuarantine}
            onChange={toggleQuarantine}
            data-testid="admin-noticias-quarantine-toggle"
            style={{ cursor: 'pointer' }}
          />
          <span>Mostrar quarentena editorial</span>
        </label>
        <span data-testid="admin-noticias-quarantine-count" style={{ color: '#F0B90B', fontWeight: 600 }}>
          {quarantineCount}
        </span>
        <span>
          {showQuarantine
            ? 'notícia(s) barrada(s) pelo gate editorial, exibida(s) na lista abaixo.'
            : 'notícia(s) barrada(s) pelo gate editorial, ocultas da lista. Nada foi apagado nem despublicado.'}
        </span>
      </div>

      {loading && <div data-testid="admin-noticias-loading" style={{ color: '#8f95a5', padding: '20px' }}>Carregando...</div>}
      {error && <div data-testid="admin-noticias-error" style={{ color: '#F6465D', padding: '20px' }}>Erro: {error}</div>}

      {actionError && (
        <div
          data-testid="admin-noticias-action-error"
          style={{
            marginBottom: '12px',
            padding: '10px 14px',
            background: 'rgba(246, 70, 93, 0.08)',
            border: '1px solid rgba(246, 70, 93, 0.2)',
            borderRadius: '6px',
            color: '#f6465d',
            fontSize: '12px',
          }}
        >
          {actionError}
        </div>
      )}

      {actionSuccess && (
        <div
          data-testid="admin-noticias-action-success"
          style={{
            marginBottom: '12px',
            padding: '10px 14px',
            background: 'rgba(46, 189, 133, 0.08)',
            border: '1px solid rgba(46, 189, 133, 0.2)',
            borderRadius: '6px',
            color: '#2EBD85',
            fontSize: '12px',
          }}
        >
          {actionSuccess}
        </div>
      )}

      {editNotice && (
        <div
          data-testid="admin-noticias-group-affected-notice"
          style={{
            marginBottom: '12px',
            padding: '10px 14px',
            background: 'rgba(46, 189, 133, 0.08)',
            border: '1px solid rgba(46, 189, 133, 0.2)',
            borderRadius: '6px',
            color: '#2EBD85',
            fontSize: '12px',
          }}
        >
          {editNotice}
        </div>
      )}

      <div data-testid="admin-noticias-list">
        {filteredNews.map((item) => {
          const teamLines = resolveTeamLines(item)
          const fallbackBadge = resolveFallbackBadge(item, teamLines)
          const statusLabel = item.isArchived ? 'ARQUIVADA' : item.isPublished ? 'PUBLICADA' : 'RASCUNHO'
          const statusColor = item.isArchived ? '#929aa5' : item.isPublished ? '#2EBD85' : '#F0B90B'
          const isExternal = isExternalSource(item)
          // So faz sentido mostrar o motivo enquanto a noticia continua fora do ar.
          // Se o operador publicou na mao, o motivo vira historico e some do card.
          const editorialBlock =
            !item.isPublished && item.editorialBlockReason
              ? (EDITORIAL_BLOCK_LABELS[item.editorialBlockReason] ?? {
                  label: item.editorialBlockReason.toUpperCase(),
                  hint: 'Bloqueada pelo gate editorial do motor.',
                })
              : null

          return (
            <div key={item.id} className={`news-card ${item.isPublished ? 'published' : ''}`} data-testid={`admin-noticias-card-${item.id}`}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div className="news-badges">
                    {/* O time saiu daqui: virou uma linha por time na coluna da
                        direita, ao lado do sentimento de cada um (a badge nua na
                        esquerda não dizia de quem era o "Neutral" do canto).
                        A badge `grupo {hash}` também saiu — mostrava 6 chars de um
                        uuid que não significam nada para o operador. A informação
                        que ela tentava dar (é um fato multi-time) agora vem do
                        próprio número de linhas à direita, e o id completo continua
                        acessível no tooltip do rótulo do grupo. */}
                    {teamLines.length > 1 && (
                      <span
                        className="badge"
                        data-testid={`admin-noticias-group-badge-${item.groupId ?? item.id}`}
                        style={{ color: 'var(--accent)' }}
                        title={`Mesmo fato em ${teamLines.length} times — id do grupo: ${item.groupId ?? item.id}`}
                      >
                        {teamLines.length} times
                      </span>
                    )}
                    <span className="badge" data-testid={`admin-noticias-impact-badge-${item.id}`} style={{ color: 'var(--muted)' }}>
                      {IMPACT_CATEGORY_LABELS[item.impact] ?? item.impact}
                    </span>
                    <span className="badge" data-testid={`admin-noticias-status-badge-${item.id}`} style={{ color: statusColor }}>{statusLabel}</span>
                    {editorialBlock && (
                      <span
                        className="badge"
                        data-testid={`admin-noticias-editorial-badge-${item.id}`}
                        style={{ color: '#F6465D' }}
                        title={editorialBlock.hint}
                      >
                        {editorialBlock.label}
                      </span>
                    )}
                    {fallbackBadge && (
                      <span
                        className="badge"
                        data-testid={`admin-noticias-fallback-badge-${item.id}`}
                        style={{ color: '#F0B90B' }}
                        title={fallbackBadge.reason}
                      >
                        Fallback
                      </span>
                    )}
                    {isExternal && (
                      <span
                        className="badge"
                        data-testid={`admin-noticias-source-badge-${item.id}`}
                        style={{ color: '#929aa5', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title="Notícia de fonte externa — título e conteúdo protegidos"
                      >
                        <Lock size={10} />
                        {item.source}
                      </span>
                    )}
                  </div>
                  <div className="news-title" data-testid={`admin-noticias-title-${item.id}`}>{item.title}</div>
                  <div data-testid={`admin-noticias-content-preview-${item.id}`} style={{ fontSize: '12px', color: '#929aa5', marginBottom: '6px', lineHeight: '1.4' }}>
                    {item.content.length > 120 ? `${item.content.slice(0, 120)}...` : item.content}
                  </div>
                  <div className="news-author" data-testid={`admin-noticias-meta-${item.id}`}>
                    Por {item.author} · {formatDateTime(item.publishedAt || item.createdAt)} · {item.clicks} cliques
                  </div>
                </div>
                {/* Uma linha por time envolvido no fato: badge do time + o
                    sentimento DAQUELE time. A âncora (groupRank 0) vem primeiro e
                    os times adicionais em rows abaixo. Notícia de um time só
                    renderiza uma linha e fica visualmente igual ao de antes. */}
                <div
                  data-testid={`admin-noticias-teams-${item.id}`}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}
                >
                  {teamLines.map((team) => {
                    const teamColor = getSentimentColor(team.sentiment)
                    const teamLabel = getSentimentLabel(team.sentiment)
                    const clubName = team.ticker ? CLUB_NAME_BY_TICKER.get(team.ticker) : undefined

                    return (
                      <div
                        key={team.id}
                        data-testid={`admin-noticias-team-row-${team.id}`}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}
                      >
                        {team.ticker ? (
                          <span
                            className="badge"
                            data-testid={`admin-noticias-ticker-badge-${team.id}`}
                            style={{ color: 'var(--accent2)' }}
                            title={clubName ? `${team.ticker} — ${clubName}` : team.ticker}
                          >
                            {team.ticker}
                          </span>
                        ) : (
                          <span className="badge" style={{ color: 'var(--muted)', opacity: 0.5 }} title="Sem time vinculado">
                            Sem time
                          </span>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: '62px' }}>
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: teamColor, flexShrink: 0 }} />
                          <span
                            data-testid={`admin-noticias-sentiment-${team.id}`}
                            style={{ fontSize: '10px', fontWeight: '700', color: teamColor }}
                          >
                            {teamLabel}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="news-actions" data-testid={`admin-noticias-actions-${item.id}`}>
                <button
                  onClick={() => togglePublish(item.id, item.isPublished)}
                  className="btn btn-sm btn-outline"
                  data-testid={`admin-noticias-publish-button-${item.id}`}
                  style={{ background: 'transparent', color: 'var(--muted)', borderColor: 'var(--muted)' }}
                >
                  {item.isPublished ? 'Despublicar' : 'Publicar'}
                </button>
                <button
                  onClick={() => openEditModal(item)}
                  className="btn btn-sm btn-outline"
                  data-testid={`admin-noticias-edit-button-${item.id}`}
                  style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                >
                  Editar
                </button>
                {!item.isArchived && (
                  <button
                    onClick={() => archiveNews(item.id)}
                    className="btn btn-sm btn-outline"
                    data-testid={`admin-noticias-archive-button-${item.id}`}
                    style={{ background: 'transparent', color: 'var(--muted)', borderColor: 'var(--muted)' }}
                  >
                    Arquivar
                  </button>
                )}
                {item.isArchived && (
                  <button
                    onClick={() => unarchiveNews(item.id)}
                    className="btn btn-sm btn-outline"
                    data-testid={`admin-noticias-unarchive-button-${item.id}`}
                    style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                  >
                    Desarquivar
                  </button>
                )}
                <button
                  onClick={() => openDeleteModal(item)}
                  className="btn btn-sm btn-outline"
                  data-testid={`admin-noticias-delete-button-${item.id}`}
                  style={{ background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' }}
                >
                  Deletar
                </button>
              </div>
            </div>
          )
        })}

        {filteredNews.length === 0 && !loading && (
          <div data-testid="admin-noticias-empty" style={{ color: '#8f95a5', textAlign: 'center', padding: '20px' }}>
            Nenhuma notícia neste filtro
          </div>
        )}
      </div>

      {/* Navegação de páginas (T-09). Renderizada mesmo com uma página só, para o
          total do acervo continuar visível; some apenas quando a listagem falhou,
          porque aí o erro já é o sinal na tela. Não tem `loading`/`error`
          próprios: herda os da requisição da listagem, igual ao contador da
          quarentena. */}
      {!error && (
        <nav
          aria-label="Paginação de notícias"
          data-testid="admin-noticias-pagination"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            marginTop: '12px',
            padding: '8px 12px',
            background: '#181A20',
            border: '1px solid #2a2d35',
            borderRadius: '6px',
            fontSize: '12px',
            color: '#8f95a5',
          }}
        >
          <span data-testid="admin-noticias-pagination-label">
            {paginationKnown ? (
              <>
                Página {pagination.page} de {pagination.totalPages} · {pagination.total}{' '}
                notícia(s)
                {showQuarantine
                  ? ' no acervo (quarentena incluída)'
                  : ' no acervo (quarentena oculta)'}
              </>
            ) : (
              <>
                Página {pagination.page} · {pagination.total} notícia(s) nesta página
                {showQuarantine ? ' (quarentena incluída)' : ' (quarentena oculta)'} · total do
                acervo indisponível
              </>
            )}
          </span>
          <span style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => goToPage(pagination.page - 1)}
              disabled={loading || pagination.page <= 1}
              aria-label="Página anterior"
              data-testid="admin-noticias-pagination-prev"
              className="btn btn-sm btn-outline"
              style={{
                color: pagination.page <= 1 || loading ? '#5b6270' : '#F0B90B',
                cursor: pagination.page <= 1 || loading ? 'not-allowed' : 'pointer',
              }}
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => goToPage(pagination.page + 1)}
              disabled={loading || pagination.page >= pagination.totalPages}
              aria-label="Próxima página"
              data-testid="admin-noticias-pagination-next"
              className="btn btn-sm btn-outline"
              style={{
                color:
                  pagination.page >= pagination.totalPages || loading ? '#5b6270' : '#F0B90B',
                cursor:
                  pagination.page >= pagination.totalPages || loading ? 'not-allowed' : 'pointer',
              }}
            >
              Próxima
            </button>
          </span>
        </nav>
      )}

      {/* ── Modal Editar ── */}
      {editingItem && (
        <div className="modal-overlay" data-testid="admin-noticias-edit-modal-overlay" onClick={() => setEditingItem(null)}>
          <div className="modal-box" data-testid="admin-noticias-edit-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Editar Noticia</h2>
              {isExternalSource(editingItem) && (
                <span
                  data-testid="admin-noticias-edit-modal-external-badge"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: '#929aa5',
                    background: 'rgba(146, 154, 165, 0.1)',
                    padding: '4px 10px',
                    borderRadius: '4px',
                  }}
                >
                  <Lock size={12} />
                  Fonte externa: {editingItem.source}
                </span>
              )}
            </div>

            {/* External source warning */}
            {isExternalSource(editingItem) && (
              <div
                data-testid="admin-noticias-edit-modal-external-warning"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '16px',
                  padding: '10px 14px',
                  background: 'rgba(240, 185, 11, 0.06)',
                  border: '1px solid rgba(240, 185, 11, 0.15)',
                  borderRadius: '6px',
                  color: '#F0B90B',
                  fontSize: '12px',
                }}
              >
                <Lock size={14} />
                Título e conteúdo protegidos contra edição para manter credibilidade da fonte original. Impacto, sentimento e time podem ser ajustados.
              </div>
            )}

            {/* Escopo da edição: o PATCH aplica título/conteúdo/impacto/fonte/
                publicação/arquivamento no GRUPO inteiro e time/sentimento só
                NESTA linha (item 017). Sem este aviso o operador acha que está
                editando uma notícia e altera as três. */}
            <GroupScopeWarning>
              <strong>Escopo desta edição:</strong> título, conteúdo, impacto, publicação e arquivamento valem para{' '}
              <strong>todos os times</strong> desta notícia (o fato é um só).{' '}
              <strong>Time e sentimento</strong> valem somente para <strong>esta linha</strong>
              {editingItem.ticker ? ` (${editingItem.ticker})` : ''}. Para ajustar o sentimento de outro time, edite a
              notícia dele.
            </GroupScopeWarning>

            {editError && (
              <div
                data-testid="admin-noticias-edit-modal-error"
                style={{
                  marginBottom: '16px',
                  padding: '10px 14px',
                  background: 'rgba(246, 70, 93, 0.08)',
                  border: '1px solid rgba(246, 70, 93, 0.2)',
                  borderRadius: '6px',
                  color: '#f6465d',
                  fontSize: '12px',
                }}
              >
                {editError}
              </div>
            )}

            <div
              data-testid="admin-noticias-edit-modal-group-fields-label"
              style={{ fontSize: '11px', fontWeight: 700, color: '#8f95a5', textTransform: 'uppercase', marginBottom: '10px' }}
            >
              Campos do fato — aplicam a todos os times
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>
                Título
                {isExternalSource(editingItem) && <Lock size={10} style={{ display: 'inline', marginLeft: '6px', verticalAlign: 'middle' }} />}
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                style={isExternalSource(editingItem) ? inputDisabledStyle : inputStyle}
                readOnly={isExternalSource(editingItem)}
                data-testid="admin-noticias-edit-modal-title-input"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>
                Conteúdo
                {isExternalSource(editingItem) && <Lock size={10} style={{ display: 'inline', marginLeft: '6px', verticalAlign: 'middle' }} />}
              </label>
              <textarea
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                style={{
                  ...(isExternalSource(editingItem) ? inputDisabledStyle : inputStyle),
                  minHeight: '120px',
                  fontFamily: 'inherit',
                  resize: isExternalSource(editingItem) ? 'none' : 'vertical',
                }}
                readOnly={isExternalSource(editingItem)}
                data-testid="admin-noticias-edit-modal-content-input"
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Impacto</label>
              <select
                value={editForm.impact}
                onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })}
                style={inputStyle}
                data-testid="admin-noticias-edit-modal-impact-select"
              >
                {IMPACT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Time e sentimento são POR LINHA: o PATCH aplica os dois somente
                nesta notícia, mesmo quando ela faz parte de um grupo. */}
            <div
              data-testid="admin-noticias-edit-modal-line-fields-label"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#8f95a5',
                textTransform: 'uppercase',
                marginBottom: '10px',
                paddingTop: '14px',
                borderTop: '1px solid #2a2d35',
              }}
            >
              Campos desta linha — aplicam somente a este time
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>Time</label>
                <select
                  value={editForm.ticker}
                  onChange={(e) => setEditForm({ ...editForm, ticker: e.target.value })}
                  style={inputStyle}
                  data-testid="admin-noticias-edit-modal-ticker-select"
                >
                  <option value="">Selecionar time...</option>
                  {CLUBS.map((c) => (
                    <option key={c.ticker} value={c.ticker}>{c.ticker} — {c.displayName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sentimento</label>
                <select
                  value={editForm.sentiment}
                  onChange={(e) => setEditForm({ ...editForm, sentiment: e.target.value })}
                  style={inputStyle}
                  data-testid="admin-noticias-edit-modal-sentiment-select"
                >
                  {SENTIMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingItem(null)}
                className="btn"
                data-testid="admin-noticias-edit-modal-cancel-button"
                style={{ background: 'transparent', color: '#8f95a5', borderColor: '#8f95a5', border: '1px solid' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="btn btn-solid"
                data-testid="admin-noticias-edit-modal-save-button"
                style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none' }}
              >
                {savingEdit ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Criar ── */}
      {creating && (
        <div className="modal-overlay" data-testid="admin-noticias-create-modal-overlay" onClick={() => setCreating(false)}>
          <div className="modal-box" data-testid="admin-noticias-create-modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0, marginBottom: '20px' }}>Nova Noticia</h2>

            {createError && (
              <div
                data-testid="admin-noticias-create-modal-error"
                style={{
                  marginBottom: '16px',
                  padding: '10px 14px',
                  background: 'rgba(246, 70, 93, 0.08)',
                  border: '1px solid rgba(246, 70, 93, 0.2)',
                  borderRadius: '6px',
                  color: '#f6465d',
                  fontSize: '12px',
                }}
              >
                {createError}
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Titulo *</label>
              <input
                type="text"
                value={createForm.title}
                onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                style={inputStyle}
                placeholder="Ex: URU3 anuncia parceria com banco digital"
                data-testid="admin-noticias-create-modal-title-input"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Conteúdo *</label>
              <textarea
                value={createForm.content}
                onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                style={{ ...inputStyle, minHeight: '120px', fontFamily: 'inherit', resize: 'vertical' }}
                placeholder="Descreva a notícia em detalhes..."
                data-testid="admin-noticias-create-modal-content-input"
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Impacto</label>
              <select
                value={createForm.impact}
                onChange={(e) => setCreateForm({ ...createForm, impact: e.target.value })}
                style={inputStyle}
                data-testid="admin-noticias-create-modal-impact-select"
              >
                {IMPACT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* Times envolvidos no MESMO fato (grupo M067). Uma linha por time,
                cada uma com sentimento próprio: uma venda é BULLISH para quem
                vende e BEARISH para quem compra. Título, conteúdo, impacto e
                fonte são do fato e ficam fora daqui. Com um time só o payload
                enviado é idêntico ao de antes deste item. */}
            <div
              data-testid="admin-noticias-create-modal-teams-section"
              style={{ marginBottom: '16px', paddingTop: '14px', borderTop: '1px solid #2a2d35' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#8f95a5', textTransform: 'uppercase' }}>
                  Times envolvidos ({1 + createForm.additionalTeams.length} de {MAX_GROUP_TEAMS})
                </div>
                {createForm.additionalTeams.length < MAX_GROUP_TEAMS - 1 && (
                  <button
                    type="button"
                    onClick={addCreateTeam}
                    className="btn btn-sm btn-outline"
                    data-testid="admin-noticias-create-modal-add-team-button"
                    style={{ background: 'transparent', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                  >
                    + Adicionar time
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>Time principal</label>
                  <select
                    value={createForm.ticker}
                    onChange={(e) => setCreateForm({ ...createForm, ticker: e.target.value })}
                    style={inputStyle}
                    data-testid="admin-noticias-create-modal-ticker-select"
                  >
                    <option value="">Selecionar time...</option>
                    {CLUBS.map((c) => (
                      <option key={c.ticker} value={c.ticker}>{c.ticker} — {c.displayName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Sentimento</label>
                  <select
                    value={createForm.sentiment}
                    onChange={(e) => setCreateForm({ ...createForm, sentiment: e.target.value })}
                    style={inputStyle}
                    data-testid="admin-noticias-create-modal-sentiment-select"
                  >
                    {SENTIMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {createForm.additionalTeams.map((team, index) => (
                <div
                  key={index}
                  data-testid={`admin-noticias-create-modal-team-${index + 1}-row`}
                  style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end', marginBottom: '12px' }}
                >
                  <div>
                    <label style={labelStyle}>Time adicional {index + 1} *</label>
                    <select
                      value={team.ticker}
                      onChange={(e) => updateCreateTeam(index, { ticker: e.target.value })}
                      style={inputStyle}
                      data-testid={`admin-noticias-create-modal-team-${index + 1}-ticker-select`}
                    >
                      <option value="">Selecionar time...</option>
                      {CLUBS.map((c) => (
                        <option key={c.ticker} value={c.ticker}>{c.ticker} — {c.displayName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Sentimento</label>
                    <select
                      value={team.sentiment}
                      onChange={(e) => updateCreateTeam(index, { sentiment: e.target.value })}
                      style={inputStyle}
                      data-testid={`admin-noticias-create-modal-team-${index + 1}-sentiment-select`}
                    >
                      {SENTIMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCreateTeam(index)}
                    className="btn btn-sm btn-outline"
                    data-testid={`admin-noticias-create-modal-team-${index + 1}-remove-button`}
                    style={{ background: 'transparent', color: 'var(--red)', borderColor: 'var(--red)' }}
                  >
                    Remover
                  </button>
                </div>
              ))}

              <div style={{ fontSize: '10px', color: '#929aa5' }}>
                {createForm.additionalTeams.length === 0
                  ? 'Notícia de um time. Adicione outro time apenas quando o MESMO fato atingir mais de um clube (ex: transferência entre dois times).'
                  : 'As linhas compartilham título, conteúdo, impacto e fonte. Cada time tem o seu sentimento.'}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Fonte (se externa)</label>
              <input
                type="text"
                value={createForm.source}
                onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}
                style={inputStyle}
                placeholder="Deixe vazio para notícia editorial. Ex: Globo Esporte, ESPN"
                data-testid="admin-noticias-create-modal-source-input"
              />
              <div style={{ fontSize: '10px', color: '#929aa5', marginTop: '4px' }}>
                Se preenchido, título e conteúdo ficarão protegidos contra edição futura.
              </div>
            </div>

            <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                id="isPublished"
                checked={createForm.isPublished}
                onChange={(e) => setCreateForm({ ...createForm, isPublished: e.target.checked })}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                data-testid="admin-noticias-create-modal-publish-checkbox"
              />
              <label htmlFor="isPublished" style={{ fontSize: '13px', cursor: 'pointer', color: 'white' }}>
                Publicar imediatamente
              </label>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCreating(false)}
                className="btn"
                data-testid="admin-noticias-create-modal-cancel-button"
                style={{ background: 'transparent', color: '#8f95a5', borderColor: '#8f95a5', border: '1px solid' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveCreate}
                disabled={savingCreate}
                className="btn btn-solid"
                data-testid="admin-noticias-create-modal-save-button"
                style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none' }}
              >
                {savingCreate ? 'Criando...' : 'Criar Noticia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Deletar ── */}
      {/* Substitui o `confirm()` nativo: o modal do navegador não é inspecionável
          por E2E, não cabe texto de escopo e não tem estado de erro. A condição
          `!editingItem` mantém os dois modais mutuamente exclusivos — ambos usam
          o mesmo `data-testid` de aviso de escopo. */}
      {deleteTarget && !editingItem && (
        <div className="modal-overlay" data-testid="admin-noticias-delete-modal-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="modal-box" data-testid="admin-noticias-delete-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <h2 style={{ margin: 0, marginBottom: '16px' }}>Deletar notícia</h2>

            {/* Escopo real do DELETE desde o item 020 (DB-23): a rota lê o
                `group_id` da linha e apaga o GRUPO INTEIRO via deleteMany, não
                apenas o id recebido. A copy anterior (item 018) descrevia com
                precisão o escopo de linha vigente até então, e virou falsa com
                DB-23. Notícia de time único tem `group_id = id`, logo para ela o
                grupo é ela mesma e o efeito prático é o de antes. O texto antigo
                não é citado aqui: o passo 5 da Verificação do item 020 grepa por
                ele como guarda de regressão. */}
            <GroupScopeWarning>
              <strong>Escopo:</strong> apaga <strong>o grupo inteiro</strong>
              {deleteTarget.ticker ? ` (a partir de ${deleteTarget.ticker})` : ''}. Se este fato envolve outros times,{' '}
              <strong>todas as linhas do mesmo fato</strong> — uma por time — são removidas na mesma operação. A
              remoção é <strong>definitiva</strong> (não vai para arquivadas) e exige perfil SUPER_ADMIN.
            </GroupScopeWarning>

            <div data-testid="admin-noticias-delete-modal-target" style={{ fontSize: '13px', marginBottom: '20px', color: 'white' }}>
              {deleteTarget.title}
            </div>

            {deleteError && (
              <div
                data-testid="admin-noticias-delete-modal-error"
                style={{
                  marginBottom: '16px',
                  padding: '10px 14px',
                  background: 'rgba(246, 70, 93, 0.08)',
                  border: '1px solid rgba(246, 70, 93, 0.2)',
                  borderRadius: '6px',
                  color: '#f6465d',
                  fontSize: '12px',
                }}
              >
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                className="btn"
                data-testid="admin-noticias-delete-modal-cancel-button"
                style={{ background: 'transparent', color: '#8f95a5', borderColor: '#8f95a5', border: '1px solid' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="btn btn-solid"
                data-testid="admin-noticias-delete-modal-confirm-button"
                style={{ background: 'var(--red)', color: 'white', border: 'none' }}
              >
                {deleting ? 'Deletando...' : 'Deletar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
