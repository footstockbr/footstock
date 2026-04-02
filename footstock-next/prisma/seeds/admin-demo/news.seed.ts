/**
 * Seed: Notícias de demonstração para painel admin
 * Module: module-23-admin-usuarios-financeiro / TASK-5
 */

import type { PrismaClient } from '@prisma/client'

const DEMO_NEWS = [
  {
    title: 'Urubu da Gavea FC anuncia renovação com jogador estrela',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'URU3',
    sentiment: 0.85,
    impactCategory: 'CONTRATACAO' as const,
    status: 'published',
  },
  {
    title: 'Porco do Parque FC vence clássico e lidera tabela',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'PORC3',
    sentiment: 0.75,
    impactCategory: 'RESULTADO_ESPORTIVO' as const,
    status: 'published',
  },
  {
    title: 'Menino da Vila anuncia patrocínio master de R$ 50 milhões',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'MENIL4',
    sentiment: 0.9,
    impactCategory: 'FINANCEIRO' as const,
    status: 'published',
  },
  {
    title: 'Soberano do Parque perde artilheiro por lesão muscular',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'SOBT3',
    sentiment: -0.8,
    impactCategory: 'LESAO' as const,
    status: 'published',
  },
  {
    title: 'Tricolor do Morumbi suspenso de competições por 3 rodadas',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'TRIC4',
    sentiment: -0.75,
    impactCategory: 'SUSPENSAO' as const,
    status: 'published',
  },
  {
    title: 'Azul-Celeste anuncia dívida de R$ 120M com credores',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'AZUL3',
    sentiment: -0.7,
    impactCategory: 'FINANCEIRO' as const,
    status: 'published',
  },
  {
    title: 'CBF anuncia mudanças no calendário do Brasileirão 2026',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'URU3',
    sentiment: 0.05,
    impactCategory: 'INSTITUCIONAL' as const,
    status: 'published',
  },
  {
    title: 'Transferências de inverno: janela aberta sem movimentações relevantes',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'PORC3',
    sentiment: 0.0,
    impactCategory: 'CONTRATACAO' as const,
    status: 'published',
  },
  {
    title: 'Resultado do clássico decide posição no ranking — análise técnica',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'TRIC4',
    sentiment: 0.55,
    impactCategory: 'RESULTADO_ESPORTIVO' as const,
    status: 'archived',
  },
  {
    title: 'Novo técnico contratado para temporada 2026/2027',
    source: 'ADMIN_DEMO',
    url: '#',
    ticker: 'AZUL3',
    sentiment: 0.6,
    impactCategory: 'CONTRATACAO' as const,
    status: 'archived',
  },
]

export async function seedAdminDemoNews(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] Não executar seed de demo em produção!')
  }

  console.log('[seed] Iniciando seed de notícias de demonstração...')

  for (const news of DEMO_NEWS) {
    // Idempotente: verificar se notícia com mesmo título já existe
    const existing = await prisma.news.findFirst({
      where: { title: news.title },
    })

    if (!existing) {
      // Verificar se o ticker existe no banco (asset)
      const asset = await prisma.asset.findUnique({ where: { ticker: news.ticker } })
      if (!asset) {
        console.log(`[seed]   ⚠ Ticker ${news.ticker} não encontrado — pulando notícia "${news.title.slice(0, 40)}..."`)
        continue
      }

      await prisma.news.create({
        data: {
          title: news.title,
          source: news.source,
          url: news.url,
          ticker: news.ticker,
          sentiment: news.sentiment,
          impactCategory: news.impactCategory,
          status: news.status,
          publishedAt: new Date(),
        },
      })
      console.log(`[seed]   ✓ "${news.title.slice(0, 50)}..."`)
    } else {
      console.log(`[seed]   ↩ Já existe: "${news.title.slice(0, 50)}..."`)
    }
  }

  console.log('[seed] Seed de notícias concluído')
}
