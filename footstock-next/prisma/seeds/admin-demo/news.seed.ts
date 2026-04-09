import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const newsSeed = async () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  console.log('[seed] News: clearing existing...')
  await prisma.news.deleteMany({})

  console.log('[seed] News: creating demo articles...')

  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)

  const news = await prisma.news.createMany({
    data: [
      {
        id: 'n001',
        title: 'URU3 anuncia patrocínio master com banco digital',
        content:
          'Clube Uruguaio anunciou parceria estratégica com instituição financeira digital para os próximos 3 anos, reforçando sua estrutura de receitas.',
        impact: 'ESPORTIVA_MAJORITARIA',
        sentiment: 'BULLISH',
        assetIds: ['uru3'],
        source: 'Comunicado Oficial',
        isPublished: true,
        publishedAt: twoHoursAgo,
        isArchived: false,
        clicks: 1420,
        author: 'admin',
        createdAt: sixHoursAgo,
        updatedAt: twoHoursAgo,
      },
      {
        id: 'n002',
        title: 'POR4 reforça elenco com contratações milionárias',
        content:
          'Clube português anuncia três novas contratações de peso para o elenco. Investimento total estimado em €5 milhões para reforçar defesa e ataque.',
        impact: 'ESPORTIVA_MAJORITARIA',
        sentiment: 'BULLISH',
        assetIds: ['por4'],
        source: 'SportTV',
        isPublished: true,
        publishedAt: fourHoursAgo,
        isArchived: false,
        clicks: 840,
        author: 'ana',
        createdAt: fourDaysAgo,
        updatedAt: fourHoursAgo,
      },
      {
        id: 'n003',
        title: 'TIM3 sofre rebaixamento para Série B',
        content:
          'Após campanha decepcionante, TIM3 é rebaixada para a segunda divisão. Clube já começou processo de reformulação administrativa e técnica.',
        impact: 'ESPORTIVA_MAJORITARIA',
        sentiment: 'BEARISH',
        assetIds: ['tim3'],
        source: 'CBV',
        isPublished: true,
        publishedAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
        isArchived: false,
        clicks: 3200,
        author: 'admin',
        createdAt: threeDaysAgo,
        updatedAt: new Date(now.getTime() - 10 * 60 * 60 * 1000),
      },
      {
        id: 'n004',
        title: 'FOG3 envolto em polêmica financeira',
        content:
          'Investigação preliminar aponta possíveis irregularidades contábeis. Clube sob supervisão de órgãos reguladores. Ações em queda de 15% no pré-mercado.',
        impact: 'FINANCEIRA_CRITICA',
        sentiment: 'BEARISH',
        assetIds: ['fog3'],
        source: 'BRL Financeiro',
        isPublished: false,
        publishedAt: null,
        isArchived: false,
        clicks: 0,
        author: 'ana',
        createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
        updatedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      },
      {
        id: 'n005',
        title: 'BAL4 promovida à Série A após campanha histórica',
        content:
          'Após 5 anos na Série B, BAL4 conquistou seu retorno à primeira divisão com campanha impressionante. Torcida celebra retorno histórico.',
        impact: 'ESPORTIVA_MAJORITARIA',
        sentiment: 'BULLISH',
        assetIds: ['bal4'],
        source: 'Globo Sports',
        isPublished: false,
        publishedAt: null,
        isArchived: false,
        clicks: 0,
        author: 'marcos',
        createdAt: new Date(now.getTime() - 30 * 60 * 1000),
        updatedAt: new Date(now.getTime() - 30 * 60 * 1000),
      },
    ],
  })

  console.log(`[seed] News: created ${news.count} articles`)
  await prisma.$disconnect()
}

newsSeed().catch((err) => {
  console.error('[seed] News error:', err)
  process.exit(1)
})
