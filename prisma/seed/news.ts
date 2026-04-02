/**
 * Seed: News — cobre TODOS os ImpactCategory e Sentiment.
 * Inclui notícias publicadas e não publicadas.
 * Idempotente (upsert por id fixo).
 */
import { prisma } from '@/lib/prisma'

const now = new Date()
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)

export async function seedNews() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:news] Seeds não executam em produção.')
  }

  const assets = await prisma.asset.findMany({ take: 8, orderBy: { ticker: 'asc' } })
  if (assets.length < 4) throw new Error('[seed:news] Poucos assets — execute seedAssets primeiro.')

  const newsSeeds = [
    // FINANCEIRA_CRITICA + BULLISH + publicada
    {
      id: 'news-001',
      title: 'Clube assina contrato de patrocínio de R$ 100 milhões',
      content: 'O Flamengo anunciou nesta terça-feira um contrato histórico de patrocínio master no valor de R$ 100 milhões anuais com uma multinacional de tecnologia. O acordo eleva significativamente o valuation do clube na bolsa virtual.',
      impact: 'FINANCEIRA_CRITICA' as const,
      sentiment: 'BULLISH' as const,
      assetIds: [assets[0]!.id],
      source: 'Lance! Sport',
      isPublished: true,
      publishedAt: d(-1),
    },
    // FINANCEIRA_CRITICA + BEARISH + publicada
    {
      id: 'news-002',
      title: 'Clube enfrenta crise financeira com dívida de R$ 400 milhões',
      content: 'Relatório da CBF aponta que o Vasco da Gama acumula dívidas de R$ 400 milhões e pode sofrer restrições de registro de atletas na próxima janela. O cenário impacta negativamente as perspectivas do ativo na plataforma.',
      impact: 'FINANCEIRA_CRITICA' as const,
      sentiment: 'BEARISH' as const,
      assetIds: [assets[1]!.id],
      source: 'Globo Esporte',
      isPublished: true,
      publishedAt: d(-2),
    },
    // ESPORTIVA_MAJORITARIA + BULLISH + publicada
    {
      id: 'news-003',
      title: 'Palmeiras vence clássico e assume liderança do Brasileirão',
      content: 'Com um gol nos acréscimos, o Palmeiras venceu o São Paulo por 2 a 1 e assumiu a liderança isolada do Campeonato Brasileiro, abrindo 4 pontos de vantagem para o segundo colocado. A vitória aquece o ativo no mercado virtual.',
      impact: 'ESPORTIVA_MAJORITARIA' as const,
      sentiment: 'BULLISH' as const,
      assetIds: [assets[2]!.id],
      source: 'UOL Esporte',
      isPublished: true,
      publishedAt: d(-3),
    },
    // ESPORTIVA_MAJORITARIA + BEARISH + publicada
    {
      id: 'news-004',
      title: 'Corinthians é eliminado da Copa do Brasil nas quartas de final',
      content: 'O Corinthians perdeu por 3 a 0 no Mineirão e foi eliminado da Copa do Brasil. Com a queda, o clube deixa de contar com premiação estimada em R$ 20 milhões, aumentando a pressão financeira sobre a diretoria.',
      impact: 'ESPORTIVA_MAJORITARIA' as const,
      sentiment: 'BEARISH' as const,
      assetIds: [assets[3]!.id],
      source: 'ESPN Brasil',
      isPublished: true,
      publishedAt: d(-4),
    },
    // MERCADO_ATIVOS + NEUTRAL + publicada
    {
      id: 'news-005',
      title: 'CBF divulga tabela do segundo turno do Brasileirão',
      content: 'A Confederação Brasileira de Futebol divulgou os jogos e datas do returno do Campeonato Brasileiro. Analistas avaliam que a distribuição dos confrontos é equilibrada entre os principais clubes negociados na plataforma.',
      impact: 'MERCADO_ATIVOS' as const,
      sentiment: 'NEUTRAL' as const,
      assetIds: assets.slice(0, 4).map(a => a.id),
      source: 'CBF Oficial',
      isPublished: true,
      publishedAt: d(-5),
    },
    // MERCADO_ATIVOS + BULLISH + NÃO publicada (rascunho)
    {
      id: 'news-006',
      title: '[RASCUNHO] Novo estádio do Athletico-PR previsto para 2027',
      content: 'O Athletico Paranaense anunciou planos para construção de um novo estádio com capacidade para 45 mil torcedores, com inauguração prevista para 2027. O projeto está em fase de aprovação pela prefeitura de Curitiba.',
      impact: 'MERCADO_ATIVOS' as const,
      sentiment: 'BULLISH' as const,
      assetIds: assets[4] ? [assets[4].id] : [],
      source: 'Athletico PR Oficial',
      isPublished: false,
      publishedAt: null,
    },
    // INTEGRIDADE_SAUDE + BEARISH + publicada
    {
      id: 'news-007',
      title: 'Jogador estrela do Fluminense sofre lesão e fica 3 meses fora',
      content: 'O artilheiro do Fluminense sofreu uma lesão muscular na coxa durante o treino desta semana. O departamento médico confirmou que o atleta ficará afastado por aproximadamente 90 dias, impactando a campanha do clube.',
      impact: 'INTEGRIDADE_SAUDE' as const,
      sentiment: 'BEARISH' as const,
      assetIds: assets[5] ? [assets[5].id] : [],
      source: 'Fluminense FC Oficial',
      isPublished: true,
      publishedAt: d(-1),
    },
    // INSTITUCIONAL + NEUTRAL + publicada
    {
      id: 'news-008',
      title: 'Grêmio anuncia novo presidente para o triênio 2026-2028',
      content: 'Em assembleia realizada na última semana, os sócios do Grêmio elegeram novo presidente para o triênio 2026-2028. A transição de gestão deve trazer mudanças na política de contratações do clube gaúcho.',
      impact: 'INSTITUCIONAL' as const,
      sentiment: 'NEUTRAL' as const,
      assetIds: assets[6] ? [assets[6].id] : [],
      source: 'Grêmio FBPA',
      isPublished: true,
      publishedAt: d(-6),
    },
    // ESPORTIVA_MENOR + BULLISH + publicada
    {
      id: 'news-009',
      title: 'Santos vence no sub-20 e lidera Campeonato Brasileiro da categoria',
      content: 'A equipe sub-20 do Santos FC venceu o Avaí por 2 a 0 e assumiu a liderança do Campeonato Brasileiro da categoria. O bom desempenho das categorias de base reforça a perspectiva positiva para o clube.',
      impact: 'ESPORTIVA_MENOR' as const,
      sentiment: 'BULLISH' as const,
      assetIds: assets[7] ? [assets[7].id] : [],
      source: 'Santos FC',
      isPublished: true,
      publishedAt: d(-2),
    },
    // INTEGRIDADE_SAUDE + NEUTRAL + publicada (multi-asset)
    {
      id: 'news-010',
      title: 'Nota da CBF sobre protocolo de saúde mental no futebol',
      content: 'A CBF publicou novo protocolo para suporte à saúde mental de atletas profissionais, seguindo recomendações da FIFA. A medida impacta todos os clubes da Série A e B e pode influenciar estratégias de contratação.',
      impact: 'INTEGRIDADE_SAUDE' as const,
      sentiment: 'NEUTRAL' as const,
      assetIds: assets.slice(0, 6).map(a => a.id),
      source: 'CBF Oficial',
      isPublished: true,
      publishedAt: d(-7),
    },
  ]

  for (const news of newsSeeds) {
    await prisma.news.upsert({
      where: { id: news.id },
      create: {
        id: news.id,
        title: news.title,
        content: news.content,
        impact: news.impact,
        sentiment: news.sentiment,
        assetIds: news.assetIds,
        source: news.source,
        isPublished: news.isPublished,
        publishedAt: news.publishedAt,
      },
      update: {},
    })
  }

  console.log('[seed:news] ✓ 10 notícias (6 ImpactCategories × 3 Sentiments, 9 publicadas + 1 rascunho)')
}
