// ============================================================================
// Foot Stock — Seed: Patrocinador de demonstração
// Cria 1 AdSponsor ativo com banners em home_top e market_top.
// Idempotente (upsert por id fixo).
// Uso: npx tsx prisma/seed/sponsors-demo.ts
// Fonte: module-24/TASK-4/ST002
// ============================================================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedDemoSponsor(): Promise<void> {
  const startsAt = new Date()
  const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // +30 dias

  const banners = {
    home_top: {
      imageUrl: 'https://placehold.co/728x90/F0B90B/000000?text=Foot+Stock+Demo',
      linkUrl: 'https://footstock.app',
      altText: 'Foot Stock - Bolsa de Valores do Futebol',
    },
    market_top: {
      imageUrl: 'https://placehold.co/728x90/1B1D2A/F0B90B?text=Invista+nos+Clubes',
      linkUrl: 'https://footstock.app/mercado',
      altText: 'Mercado de Ativos - Foot Stock',
    },
  }

  const sponsor = await prisma.adSponsor.upsert({
    where: { id: 'demo-sponsor-001' },
    create: {
      id: 'demo-sponsor-001',
      name: 'Foot Stock Demo Partner',
      logo: null,
      banners,
      activeLigaId: null,
      startsAt,
      endsAt,
      active: true,
    },
    update: {
      active: true,
      banners,
      endsAt,
    },
  })

  console.log(`✅ Demo sponsor criado/atualizado: ${sponsor.id} (${sponsor.name})`)
  console.log(`   Vigência: ${startsAt.toLocaleDateString('pt-BR')} → ${endsAt.toLocaleDateString('pt-BR')}`)
  console.log(`   Posições: home_top, market_top`)
}

seedDemoSponsor()
  .catch(e => {
    console.error('❌ Erro ao criar demo sponsor:', e)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
