import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const sponsorsSeed = async () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  const sponsors = [
    {
      id: 's001',
      name: 'Mercado Pago',
      logoUrl: null,
      contractStart: new Date('2026-01-01T00:00:00.000Z'),
      contractEnd: new Date('2026-12-31T23:59:59.000Z'),
      sponsorshipValue: '250000.00',
      isActive: true,
      createdBy: 'seed-admin',
    },
    {
      id: 's002',
      name: 'Red Bull',
      logoUrl: null,
      contractStart: new Date('2026-02-01T00:00:00.000Z'),
      contractEnd: new Date('2026-11-30T23:59:59.000Z'),
      sponsorshipValue: '180000.00',
      isActive: true,
      createdBy: 'seed-admin',
    },
    {
      id: 's003',
      name: 'PagBank',
      logoUrl: null,
      contractStart: new Date('2026-01-15T00:00:00.000Z'),
      contractEnd: new Date('2026-10-31T23:59:59.000Z'),
      sponsorshipValue: '140000.00',
      isActive: true,
      createdBy: 'seed-admin',
    },
    {
      id: 's004',
      name: 'Nike',
      logoUrl: null,
      contractStart: new Date('2026-03-01T00:00:00.000Z'),
      contractEnd: new Date('2026-12-15T23:59:59.000Z'),
      sponsorshipValue: '320000.00',
      isActive: true,
      createdBy: 'seed-admin',
    },
    {
      id: 's005',
      name: 'Spotify',
      logoUrl: null,
      contractStart: new Date('2026-04-01T00:00:00.000Z'),
      contractEnd: new Date('2026-09-30T23:59:59.000Z'),
      sponsorshipValue: '90000.00',
      isActive: false,
      createdBy: 'seed-admin',
    },
  ]

  const bannerInserts = [
    {
      id: 'b001',
      title: 'Mercado Pago acelera seus aportes',
      company: 'Mercado Pago',
      position: 'home_top',
      imageUrl: null,
      linkUrl: 'https://www.mercadopago.com.br',
      width: 1200,
      height: 320,
      isActive: true,
      clicks: 1840,
      impressions: 28600,
      color: '#00B1EA',
      ctaText: 'Abrir conta',
      ctaColor: '#00B1EA',
      sponsorId: 's001',
    },
    {
      id: 'b002',
      title: 'Red Bull Matchday Experience',
      company: 'Red Bull',
      position: 'market_top',
      imageUrl: null,
      linkUrl: 'https://www.redbull.com/br-pt',
      width: 1200,
      height: 320,
      isActive: true,
      clicks: 1290,
      impressions: 17350,
      color: '#DB0A40',
      ctaText: 'Conheca',
      ctaColor: '#DB0A40',
      sponsorId: 's002',
    },
    {
      id: 'b003',
      title: 'PagBank Pro Day para traders',
      company: 'PagBank',
      position: 'portfolio_top',
      imageUrl: null,
      linkUrl: 'https://pagbank.uol.com.br',
      width: 1200,
      height: 320,
      isActive: true,
      clicks: 760,
      impressions: 11120,
      color: '#F5A623',
      ctaText: 'Ver beneficios',
      ctaColor: '#F5A623',
      sponsorId: 's003',
    },
    {
      id: 'b004',
      title: 'Nike Draft Room Edition',
      company: 'Nike',
      position: 'leagues_top',
      imageUrl: null,
      linkUrl: 'https://www.nike.com/br',
      width: 1200,
      height: 320,
      isActive: true,
      clicks: 980,
      impressions: 14890,
      color: '#111111',
      ctaText: 'Explorar drop',
      ctaColor: '#111111',
      sponsorId: 's004',
    },
    {
      id: 'b005',
      title: 'Spotify torcida mix',
      company: 'Spotify',
      position: 'home_bottom',
      imageUrl: null,
      linkUrl: 'https://www.spotify.com/br',
      width: 1200,
      height: 320,
      isActive: false,
      clicks: 210,
      impressions: 4920,
      color: '#1DB954',
      ctaText: 'Ouvir agora',
      ctaColor: '#1DB954',
      sponsorId: 's005',
    },
  ]

  const leagueInserts = [
    {
      id: 'l001',
      name: 'Liga Mercado Pago Turbo Abril',
      company: 'Mercado Pago',
      prize: '1o: R$10.000 | 2o: R$4.000 | 3o: R$2.000',
      prizes: JSON.stringify([
        { position: 1, label: '1o Lugar', description: 'R$10.000 em conta Mercado Pago' },
        { position: 2, label: '2o Lugar', description: 'R$4.000 em conta Mercado Pago' },
        { position: 3, label: '3o Lugar', description: 'R$2.000 em conta Mercado Pago' },
        { position: 4, label: 'Top 10', description: 'Cashback de 10% por 30 dias' },
      ]),
      sponsorUrl: 'https://www.mercadopago.com.br',
      participants: 47,
      maxParticipants: 50,
      minPlan: 'CRAQUE',
      status: 'ATIVA',
      borderColor: '#00B1EA',
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      endDate: new Date('2026-04-30T23:59:59.000Z'),
    },
    {
      id: 'l002',
      name: 'Red Bull Sprint Cup',
      company: 'Red Bull',
      prize: '1o: PS5 | 2o: Cadeira gamer | 3o: Kit Red Bull',
      prizes: JSON.stringify([
        { position: 1, label: '1o Lugar', description: 'PlayStation 5 Slim + FC 26' },
        { position: 2, label: '2o Lugar', description: 'Cadeira gamer ergonomica' },
        { position: 3, label: '3o Lugar', description: 'Kit Red Bull com 24 latas' },
      ]),
      sponsorUrl: 'https://www.redbull.com/br-pt',
      participants: 30,
      maxParticipants: 30,
      minPlan: 'JOGADOR',
      status: 'ENCERRADA',
      borderColor: '#DB0A40',
      startDate: new Date('2026-03-01T00:00:00.000Z'),
      endDate: new Date('2026-03-31T23:59:59.000Z'),
    },
    {
      id: 'l003',
      name: 'PagBank Portfolio Masters',
      company: 'PagBank',
      prize: '1o: R$15.000 | 2o: iPhone | 3o: R$3.000',
      prizes: JSON.stringify([
        { position: 1, label: '1o Lugar', description: 'R$15.000 em investimento assistido' },
        { position: 2, label: '2o Lugar', description: 'iPhone 17 Pro 256GB' },
        { position: 3, label: '3o Lugar', description: 'R$3.000 em saldo PagBank' },
        { position: 4, label: '4o Lugar', description: 'Smartwatch premium' },
        { position: 5, label: '5o Lugar', description: 'Voucher de R$750' },
      ]),
      sponsorUrl: 'https://pagbank.uol.com.br',
      participants: 12,
      maxParticipants: 40,
      minPlan: 'LENDA',
      status: 'AGENDADA',
      borderColor: '#F5A623',
      startDate: new Date('2026-05-10T00:00:00.000Z'),
      endDate: new Date('2026-06-10T23:59:59.000Z'),
    },
    {
      id: 'l004',
      name: 'Nike Elite Draft Series',
      company: 'Nike',
      prize: '1o: Viagem + camarote | 2o: Kit Nike | 3o: R$5.000',
      prizes: JSON.stringify([
        { position: 1, label: '1o Lugar', description: 'Viagem para final continental + camarote' },
        { position: 2, label: '2o Lugar', description: 'Kit Nike elite com chuteira, camisa e mochila' },
        { position: 3, label: '3o Lugar', description: 'R$5.000 em credito' },
      ]),
      sponsorUrl: 'https://www.nike.com/br',
      participants: 18,
      maxParticipants: 24,
      minPlan: 'CRAQUE',
      status: 'ATIVA',
      borderColor: '#111111',
      startDate: new Date('2026-04-10T00:00:00.000Z'),
      endDate: new Date('2026-05-05T23:59:59.000Z'),
    },
  ]

  try {
    console.log('[seed] Sponsors: clearing existing...')
    await prisma.$executeRawUnsafe('DELETE FROM "sponsored_league_members"')
    await prisma.$executeRawUnsafe('DELETE FROM "sponsor_banners"')
    await prisma.$executeRawUnsafe('DELETE FROM "sponsored_leagues"')
    await prisma.$executeRawUnsafe('DELETE FROM "sponsors"')

    console.log('[seed] Sponsors: creating demo sponsors...')
    for (const sponsor of sponsors) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "sponsors" (
          id, name, logo_url, contract_start, contract_end,
          sponsorship_value, is_active, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6::decimal, $7, $8, NOW())`,
        sponsor.id,
        sponsor.name,
        sponsor.logoUrl,
        sponsor.contractStart,
        sponsor.contractEnd,
        sponsor.sponsorshipValue,
        sponsor.isActive,
        sponsor.createdBy
      )
    }

    console.log('[seed] Sponsors: creating demo banners...')
    for (const banner of bannerInserts) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "sponsor_banners" (
          id, title, company, position, image_url, link_url,
          width, height, is_active, clicks, impressions,
          color, cta_text, cta_color, sponsor_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())`,
        banner.id,
        banner.title,
        banner.company,
        banner.position,
        banner.imageUrl,
        banner.linkUrl,
        banner.width,
        banner.height,
        banner.isActive,
        banner.clicks,
        banner.impressions,
        banner.color,
        banner.ctaText,
        banner.ctaColor,
        banner.sponsorId
      )
    }

    console.log('[seed] Sponsors: creating demo leagues...')
    for (const league of leagueInserts) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "sponsored_leagues" (
          id, name, company, prize, prizes, sponsor_url,
          participants, max_participants, min_plan, status,
          border_color, start_date, end_date, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
        league.id,
        league.name,
        league.company,
        league.prize,
        league.prizes,
        league.sponsorUrl,
        league.participants,
        league.maxParticipants,
        league.minPlan,
        league.status,
        league.borderColor,
        league.startDate,
        league.endDate
      )
    }

    console.log(
      `[seed] Sponsors: created ${sponsors.length} sponsors, ${bannerInserts.length} banners and ${leagueInserts.length} leagues`
    )
  } finally {
    await prisma.$disconnect()
  }
}

sponsorsSeed().catch((err) => {
  console.error('[seed] Sponsors error:', err)
  process.exit(1)
})
