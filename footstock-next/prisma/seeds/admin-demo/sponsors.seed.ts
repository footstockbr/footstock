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
  await prisma.$executeRawUnsafe('DELETE FROM "sponsor_banners"')
  await prisma.$executeRawUnsafe('DELETE FROM "sponsored_leagues"')

  console.log('[seed] Sponsors: creating demo banners...')

  const bannerInserts = [
    { id: 'b001', title: 'Mercado Pago — Pague em dia', company: 'Mercado Pago', position: 'home-top', isActive: true, clicks: 1240, impressions: 18400, color: '#00B1EA', ctaText: 'Saiba mais', ctaColor: '#00B1EA' },
    { id: 'b002', title: 'Red Bull te dá asas', company: 'Red Bull', position: 'market-top', isActive: true, clicks: 890, impressions: 12300, color: '#CC0000', ctaText: 'Conheça', ctaColor: '#CC0000' },
    { id: 'b003', title: 'PagSeguro — Segurança total', company: 'PagSeguro', position: 'cart-top', isActive: false, clicks: 320, impressions: 5100, color: '#f97316', ctaText: 'Ver oferta', ctaColor: '#f97316' },
  ]

  for (const b of bannerInserts) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "sponsor_banners" (id, title, company, position, is_active, clicks, impressions, color, cta_text, cta_color, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
      b.id, b.title, b.company, b.position, b.isActive, b.clicks, b.impressions, b.color, b.ctaText, b.ctaColor
    )
  }

  console.log('[seed] Sponsors: creating demo leagues...')

  const leagueInserts = [
    { id: 'l001', name: 'Liga FootStock Março 2026', company: 'Mercado Pago', prize: 'FS$10.000', participants: 43, maxParticipants: 50, minPlan: 'CRAQUE', status: 'ATIVA', borderColor: '#00B1EA', startDate: new Date('2026-03-01'), endDate: new Date('2026-03-31') },
    { id: 'l002', name: 'Desafio Red Bull', company: 'Red Bull', prize: 'FS$5.000', participants: 28, maxParticipants: 30, minPlan: 'JOGADOR', status: 'ENCERRADA', borderColor: '#CC0000', startDate: new Date('2026-03-15'), endDate: new Date('2026-03-31') },
    { id: 'l003', name: 'Liga Lenda Exclusiva', company: 'PagSeguro', prize: 'FS$25.000', participants: 7, maxParticipants: 20, minPlan: 'LENDA', status: 'AGENDADA', borderColor: '#f59e0b', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-31') },
  ]

  for (const l of leagueInserts) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "sponsored_leagues" (id, name, company, prize, participants, max_participants, min_plan, status, border_color, start_date, end_date, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      l.id, l.name, l.company, l.prize, l.participants, l.maxParticipants, l.minPlan, l.status, l.borderColor, l.startDate, l.endDate
    )
  }

  console.log(`[seed] Sponsors: created ${bannerInserts.length} banners and ${leagueInserts.length} leagues`)
  await prisma.$disconnect()
}

sponsorsSeed().catch((err) => {
  console.error('[seed] Sponsors error:', err)
  process.exit(1)
})
