/**
 * Seed: Ativos de demonstração para trading
 * Module: module-23-admin-usuarios-financeiro / TASK-5
 *
 * Cria ativos (clubes) para que o seed de engajamento possa gerar dados realistas
 *
 * GUARD: Não executar em produção
 */

import type { PrismaClient } from '@prisma/client'

const DEMO_ASSETS = [
  { ticker: 'URU3', name: 'Urubu da Gavea FC', slug: 'urubu', division: 'SERIE_A' },
  { ticker: 'PORC3', name: 'Porco do Parque FC', slug: 'porco', division: 'SERIE_A' },
  { ticker: 'MENIL4', name: 'Menino da Vila FC', slug: 'menino', division: 'SERIE_A' },
  { ticker: 'SOBT3', name: 'Soberano do Parque FC', slug: 'soberano', division: 'SERIE_A' },
  { ticker: 'TRIC4', name: 'Tricolor do Morumbi', slug: 'tricolor', division: 'SERIE_A' },
  { ticker: 'AZUL3', name: 'Azul-Celeste FC', slug: 'azul', division: 'SERIE_A' },
  { ticker: 'PALM3', name: 'Palmeiras', slug: 'palmeiras', division: 'SERIE_A' },
  { ticker: 'FLAM3', name: 'Flamengo', slug: 'flamengo', division: 'SERIE_A' },
  { ticker: 'GREM4', name: 'Gremio', slug: 'gremio', division: 'SERIE_A' },
  { ticker: 'CORI3', name: 'Corinthians', slug: 'corinthians', division: 'SERIE_A' },
  { ticker: 'SAOP3', name: 'Sao Paulo FC', slug: 'saopaulo', division: 'SERIE_A' },
  { ticker: 'BOTF3', name: 'Botafogo', slug: 'botafogo', division: 'SERIE_A' },
]

export async function seedAdminDemoAssets(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] Não executar seed de demo em produção!')
  }

  console.log('[seed] Iniciando seed de ativos...')

  // Check if assets already exist
  const existingCount = await prisma.asset.count()

  if (existingCount > 0) {
    console.log(`[seed]   ℹ ${existingCount} ativos já existem no banco`)
    return
  }

  for (const asset of DEMO_ASSETS) {
    try {
      const price = 10 + Math.random() * 100 // R$10-110
      await prisma.asset.create({
        data: {
          ticker: asset.ticker,
          name: asset.name,
          clubSlug: asset.slug,
          division: asset.division as any,
          cluster: 'A_TOP',
          currentPrice: price,
          openPrice: price,
          closePrice: price,
          marketCap: 50000000,
          colorPrimary: '#F0B90B', // Ouro
          colorSecondary: '#1E2329', // Cinza escuro
          sentiment: 'NEUTRAL',
        },
      })
      console.log(`[seed]   ✓ ${asset.ticker} - ${asset.name} (R$ ${price.toFixed(2)})`)
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        console.log(`[seed]   ~ ${asset.ticker} já existe no banco`)
      } else {
        throw error
      }
    }
  }

  console.log(`[seed] Seed de ativos concluído — ${DEMO_ASSETS.length} ativos criados`)
}
