// ============================================================================
// FootStock — seed dedicado do caso multi-time do desenho B (M067)
// Item 023 do loop 07-28-noticias-multi-time-linha-por-time (ST010).
//
// Arquivo separado de news.seed.ts (nao estendido): admin-demo/ ja segue 1
// arquivo por dominio (assets.seed.ts, financial.seed.ts, engagement.seed.ts,
// ...) e este caso tem uma invariante propria (2 linhas com groupId
// compartilhado) que nao faz sentido misturar com as 5 linhas mono-time de
// news.seed.ts. Mesmo padrao standalone: PrismaClient proprio, invocado via
// `npx ts-node prisma/seeds/admin-demo/news-multi-team.seed.ts`.
//
// Cenario: noticia com 2 times, mesma impactCategory (mesma magnitude),
// sentimento oposto — origem em source.md:1138 (D7, "Seed 'PAL3 goleia URU3
// 4x0' gera 2 linhas, 2 despachos e 1 card com 2 badges de sinal oposto").
//
// Substituicao de ticker (decisao do operador, 2026-07-30, ver
// _ITERACTION-LOG.md item 023 / blacksmith/recovery): PAL3 NAO E um
// Asset.ticker real deste projeto — existe apenas como alias de busca em
// AssetAlias, resolvendo para o ticker fictício real POR3 (Porco do Parque
// FC, ver assets.seed.ts). O operador determinou que PAL3 nao deve aparecer
// como valor de dado em nenhum artefato deste item. Este seed usa POR3 no
// lugar de PAL3 em todo campo de dado; o cenario permanece "POR3 goleia
// URU3 4x0" e cobre a mesma invariante (2 linhas, mesma impactCategory,
// sentimento oposto) que source.md:1138 descreve para o par PAL3/URU3.
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/** Ids fixos e estaveis do grupo — permitem delete-then-create idempotente
 *  sem tocar nas linhas de news.seed.ts (que usa 'n001'..'n005'). */
const GROUP_ANCHOR_ID = 'news-m067-por3-uru3-anchor'
const GROUP_SIBLING_ID = 'news-m067-por3-uru3-sibling'

const newsMultiTeamSeed = async () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  console.log('[seed] News multi-team (POR3 goleia URU3 4x0): resolvendo ativos reais...')

  // Zero Assumido: os ids sao resolvidos por consulta real, nunca hardcoded/
  // inventados. Se os tickers nao existirem no seed de ativos, o script falha
  // ruidosamente em vez de inventar um asset (mesma logica da Stop Condition
  // #2 deste item: nao gravar dado que nao pode ser verificado).
  const [porAsset, uruAsset] = await Promise.all([
    prisma.asset.findUnique({ where: { ticker: 'POR3' }, select: { id: true } }),
    prisma.asset.findUnique({ where: { ticker: 'URU3' }, select: { id: true } }),
  ])

  if (!porAsset) {
    throw new Error(
      "[seed] News multi-team: ativo com ticker 'POR3' nao encontrado. " +
        'Rodar seedAdminDemoAssets (assets.seed.ts) antes deste seed.'
    )
  }
  if (!uruAsset) {
    throw new Error(
      "[seed] News multi-team: ativo com ticker 'URU3' nao encontrado. " +
        'Rodar seedAdminDemoAssets (assets.seed.ts) antes deste seed.'
    )
  }

  console.log('[seed] News multi-team: limpando linhas anteriores do proprio grupo (escopo por id fixo)...')
  // Delete escopado aos 2 ids fixos deste grupo, nunca um deleteMany({}) — que
  // apagaria as linhas mono-time de news.seed.ts (fora do escopo deste seed).
  await prisma.news.deleteMany({ where: { id: { in: [GROUP_ANCHOR_ID, GROUP_SIBLING_ID] } } })

  console.log('[seed] News multi-team: gravando grupo POR3 (ancora) / URU3 (irmao)...')

  const now = new Date()
  const publishedAt = new Date(now.getTime() - 90 * 60 * 1000) // 1h30 atras

  // Ancora (groupRank 0): id fixo escolhido explicitamente, entao groupId =
  // o proprio id ja no create — nao precisa do update pos-create que
  // newsGroupWriter.ts usa quando o id vem de cuid() em runtime.
  await prisma.news.create({
    data: {
      id: GROUP_ANCHOR_ID,
      title: 'POR3 goleia URU3 por 4 a 0 em confronto direto',
      content:
        'Vitoria consolida a boa fase do Porco do Parque FC e agrava a crise do Urubu da Gavea FC, ' +
        'que ve o rival abrir vantagem na tabela. Mesma noticia, impacto oposto para cada clube.',
      impact: 'ESPORTIVA_MAJORITARIA',
      sentiment: 'BULLISH',
      ticker: 'POR3',
      assetIds: [porAsset.id],
      source: 'Comunicado Oficial',
      isPublished: true,
      publishedAt,
      isArchived: false,
      author: 'admin',
      groupId: GROUP_ANCHOR_ID,
      groupRank: 0,
      // Seed nao passa pelo NewsPublisher real; marcamos o despacho como
      // concluido no proprio ato de semear para nao deixar a linha elegivel
      // ao reconciliador de impacto pendente (DB-12, criterio 4).
      impactDispatchedAt: publishedAt,
      createdAt: publishedAt,
      updatedAt: publishedAt,
    },
  })

  // Irmao (groupRank 1): mesma impactCategory e publishedAt da ancora
  // (mesma magnitude, sinal oposto — criterio 3 da secao 12 de source.md).
  await prisma.news.create({
    data: {
      id: GROUP_SIBLING_ID,
      title: 'POR3 goleia URU3 por 4 a 0 em confronto direto',
      content:
        'Vitoria consolida a boa fase do Porco do Parque FC e agrava a crise do Urubu da Gavea FC, ' +
        'que ve o rival abrir vantagem na tabela. Mesma noticia, impacto oposto para cada clube.',
      impact: 'ESPORTIVA_MAJORITARIA',
      sentiment: 'BEARISH',
      ticker: 'URU3',
      assetIds: [uruAsset.id],
      source: 'Comunicado Oficial',
      isPublished: true,
      publishedAt,
      isArchived: false,
      author: 'admin',
      groupId: GROUP_ANCHOR_ID,
      groupRank: 1,
      impactDispatchedAt: publishedAt,
      createdAt: publishedAt,
      updatedAt: publishedAt,
    },
  })

  console.log('[seed] News multi-team: grupo gravado (2 linhas, groupId=%s)', GROUP_ANCHOR_ID)
  await prisma.$disconnect()
}

newsMultiTeamSeed().catch((err) => {
  console.error('[seed] News multi-team error:', err)
  process.exit(1)
})
