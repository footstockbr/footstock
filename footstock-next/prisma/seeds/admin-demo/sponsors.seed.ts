import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const sponsorsSeed = async () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  console.log('[seed] Sponsors: clearing existing...')
  await prisma.$executeRawUnsafe('DELETE FROM "sponsored_league_members"')
  await prisma.$executeRawUnsafe('DELETE FROM "sponsor_banners"')
  await prisma.$executeRawUnsafe('DELETE FROM "sponsored_leagues"')

  console.log('[seed] Sponsors: creating demo banners...')

  const bannerInserts = [
    { id: 'b001', title: 'Mercado Pago — Pague em dia', company: 'Mercado Pago', position: 'home_top', isActive: true, clicks: 1240, impressions: 18400, color: '#00B1EA', ctaText: 'Saiba mais', ctaColor: '#00B1EA', linkUrl: 'https://www.mercadopago.com.br' },
    { id: 'b002', title: 'Red Bull te da asas', company: 'Red Bull', position: 'market_top', isActive: true, clicks: 890, impressions: 12300, color: '#CC0000', ctaText: 'Conheca', ctaColor: '#CC0000', linkUrl: 'https://www.redbull.com/br-pt' },
    { id: 'b003', title: 'PagSeguro — Seguranca total', company: 'PagSeguro', position: 'cart_top', isActive: false, clicks: 320, impressions: 5100, color: '#f97316', ctaText: 'Ver oferta', ctaColor: '#f97316', linkUrl: 'https://www.pagseguro.com.br' },
  ]

  for (const b of bannerInserts) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "sponsor_banners" (id, title, company, position, is_active, clicks, impressions, color, cta_text, cta_color, link_url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      b.id, b.title, b.company, b.position, b.isActive, b.clicks, b.impressions, b.color, b.ctaText, b.ctaColor, b.linkUrl
    )
  }

  console.log('[seed] Sponsors: creating demo leagues...')

  const leagueInserts = [
    {
      id: 'l001',
      name: 'Liga FootStock Marco 2026',
      company: 'Mercado Pago',
      prize: '1o: R$5.000 | 2o: R$2.000 | 3o: R$1.000',
      prizes: JSON.stringify([
        { position: 1, label: '1o Lugar', description: 'R$5.000 em dinheiro' },
        { position: 2, label: '2o Lugar', description: 'R$2.000 em dinheiro' },
        { position: 3, label: '3o Lugar', description: 'R$1.000 em dinheiro' },
      ]),
      sponsorUrl: 'https://www.mercadopago.com.br',
      participants: 43,
      maxParticipants: 50,
      minPlan: 'CRAQUE',
      status: 'ATIVA',
      borderColor: '#00B1EA',
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-31'),
    },
    {
      id: 'l002',
      name: 'Desafio Red Bull',
      company: 'Red Bull',
      prize: '1o: PlayStation 5 | 2o: Headset Gamer',
      prizes: JSON.stringify([
        { position: 1, label: '1o Lugar', description: 'PlayStation 5 + 2 jogos' },
        { position: 2, label: '2o Lugar', description: 'Headset Gamer HyperX' },
        { position: 3, label: '3o Lugar', description: 'Pack Red Bull 12 latas' },
      ]),
      sponsorUrl: 'https://www.redbull.com/br-pt',
      participants: 28,
      maxParticipants: 30,
      minPlan: 'JOGADOR',
      status: 'ENCERRADA',
      borderColor: '#CC0000',
      startDate: new Date('2026-03-15'),
      endDate: new Date('2026-03-31'),
    },
    {
      id: 'l003',
      name: 'Liga Lenda Exclusiva',
      company: 'PagSeguro',
      prize: '1o: Viagem para Portugal | 2o: iPhone 16 | 3o: R$3.000',
      prizes: JSON.stringify([
        { position: 1, label: '1o Lugar', description: 'Viagem para Portugal (passagem + 5 noites)' },
        { position: 2, label: '2o Lugar', description: 'iPhone 16 Pro' },
        { position: 3, label: '3o Lugar', description: 'R$3.000 em dinheiro' },
        { position: 4, label: '4o Lugar', description: 'Camisa oficial do clube favorito' },
        { position: 5, label: '5o Lugar', description: 'Vale-presente R$500' },
      ]),
      sponsorUrl: 'https://www.pagseguro.com.br',
      participants: 7,
      maxParticipants: 20,
      minPlan: 'LENDA',
      status: 'AGENDADA',
      borderColor: '#f59e0b',
      startDate: new Date('2026-05-01'),
      endDate: new Date('2026-05-31'),
    },
  ]

  for (const l of leagueInserts) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "sponsored_leagues" (id, name, company, prize, prizes, sponsor_url, participants, max_participants, min_plan, status, border_color, start_date, end_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
      l.id, l.name, l.company, l.prize, l.prizes, l.sponsorUrl, l.participants, l.maxParticipants, l.minPlan, l.status, l.borderColor, l.startDate, l.endDate
    )
  }

  console.log(`[seed] Sponsors: created ${bannerInserts.length} banners and ${leagueInserts.length} leagues`)
  await prisma.$disconnect()
}

sponsorsSeed().catch((err) => {
  console.error('[seed] Sponsors error:', err)
  process.exit(1)
})
