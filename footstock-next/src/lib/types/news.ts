// ============================================================================
// FootStock — News Types
// ============================================================================

import type { AssetSentiment, ImpactCategory } from '@/types'

export interface NewsInjectEvent {
  type?: 'NEWS'
  assetId?: string
  newsId?: string
  ticker: string
  title: string
  sentiment: number
  impactCategory: string
  source?: string
  publishedAt?: string
  correlationId?: string
  durationTicks: number
  curveType?: 'canonical' | 'parameterized'
}

// ─── M067 — payload agrupado do feed (item 015) ──────────────────────────────
// Uma noticia multi-time e um GRUPO de linhas que compartilham `group_id`: a
// ancora (`group_rank = 0`, time principal) e ate dois irmaos (`group_rank` 1 e
// 2, cap do CHECK news_group_rank_chk da M067). O feed publico devolve UMA
// entrada por grupo; as demais linhas visiveis do grupo viajam em `teams[]`.
//
// Nota de nulabilidade: no banco `group_id` e `group_rank` sao nullable nesta
// etapa (o aperto para NOT NULL e a fase D8, item 027). O payload NAO propaga
// `null`: a rota aplica o fallback `groupId ?? row.id` e `groupRank ?? 0`,
// coerente com o backfill unitario do item 008 (todo o acervo virou grupo de um
// time so, `group_id = id`, `group_rank = 0`) e com a trigger
// news_group_defaults_trg, que cobre a janela em que o publisher antigo ainda
// escreve sem semantica de grupo. Por isso os campos abaixo sao nao-nulos.
//
// Os tipos vem de `@/types` (contrato do front), nunca de `@prisma/client`:
// tipo de banco nao vaza para o consumidor do payload.

/** Uma linha de time dentro de um grupo de noticia. */
export interface NewsTeamLine {
  id: string
  /** `ticker` e nullable no banco (F13): linha sem ativo vinculado. */
  ticker: string | null
  assetIds: string[]
  sentiment: AssetSentiment
  impact: ImpactCategory
  /** 0 = ancora (time principal); 1 e 2 = irmaos. */
  groupRank: number
}

/**
 * Item do feed publico `/api/v1/news`. Os campos de topo sao os que
 * `noticias-content.tsx` ja consome (contrato preservado) mais os campos de
 * grupo. Sem filtro, o topo vem da linha ancora; com filtro (`assetId`,
 * `ticker` ou `impact`), vem da linha que casou o filtro com o menor
 * `groupRank` — e isso que faz `?ticker=URU3` devolver o sentimento da linha do
 * URU3, nao o da ancora.
 */
export interface NewsFeedItem {
  id: string
  title: string
  content: string | null
  source: string | null
  assetIds: string[]
  sentiment: AssetSentiment
  impact: ImpactCategory
  isPublished: boolean
  publishedAt: string | null
  createdAt: string
  groupId: string
  groupRank: number
  ticker: string | null
  /** Todas as linhas visiveis do grupo, ordenadas por `groupRank` asc. */
  teams: NewsTeamLine[]
}
