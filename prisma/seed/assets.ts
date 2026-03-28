import { prisma } from '@/lib/prisma'
import type { Division } from '@prisma/client'

interface ClubSeedData {
  ticker: string
  name: string
  clubSlug: string
  division: Division
  cluster: string
  colorPrimary: string
  colorSecondary: string
  fanbaseMillion: number
  nationalTitles: number
  recentPerformance: number // 0-10
}

/**
 * Fórmula de valuation:
 * preço = (torcida_em_milhões × 0.5) + (títulos_nacionais × 2) + (últimos_3_anos_pos × 0.3)
 * Normalizado entre FS$1.00 e FS$50.00
 */
function calcPrice(data: ClubSeedData): number {
  const raw =
    data.fanbaseMillion * 0.5 +
    data.nationalTitles * 2 +
    data.recentPerformance * 0.3
  return Math.max(1.0, Math.min(50.0, parseFloat(raw.toFixed(2))))
}

const SERIE_A_CLUBS: ClubSeedData[] = [
  {
    ticker: 'FLM3', name: 'Flamengo', clubSlug: 'flamengo',
    division: 'SERIE_A', cluster: 'A_TOP',
    colorPrimary: '#e21d1d', colorSecondary: '#1a1a1a',
    fanbaseMillion: 42, nationalTitles: 8, recentPerformance: 9.5,
  },
  {
    ticker: 'PAL3', name: 'Palmeiras', clubSlug: 'palmeiras',
    division: 'SERIE_A', cluster: 'A_TOP',
    colorPrimary: '#006600', colorSecondary: '#ffffff',
    fanbaseMillion: 18, nationalTitles: 10, recentPerformance: 9.8,
  },
  {
    ticker: 'COR3', name: 'Corinthians', clubSlug: 'corinthians',
    division: 'SERIE_A', cluster: 'A_TOP',
    colorPrimary: '#1a1a1a', colorSecondary: '#ffffff',
    fanbaseMillion: 30, nationalTitles: 7, recentPerformance: 6.5,
  },
  {
    ticker: 'SAO3', name: 'São Paulo', clubSlug: 'sao-paulo',
    division: 'SERIE_A', cluster: 'A_TOP',
    colorPrimary: '#e21d1d', colorSecondary: '#000000',
    fanbaseMillion: 15, nationalTitles: 6, recentPerformance: 7.0,
  },
  {
    ticker: 'CAM3', name: 'Atlético Mineiro', clubSlug: 'atletico-mg',
    division: 'SERIE_A', cluster: 'A_TOP',
    colorPrimary: '#1a1a1a', colorSecondary: '#ffffff',
    fanbaseMillion: 9, nationalTitles: 2, recentPerformance: 9.0,
  },
  {
    ticker: 'INT3', name: 'Internacional', clubSlug: 'internacional',
    division: 'SERIE_A', cluster: 'A_MID',
    colorPrimary: '#cc0000', colorSecondary: '#ffffff',
    fanbaseMillion: 10, nationalTitles: 3, recentPerformance: 7.5,
  },
  {
    ticker: 'GRE3', name: 'Grêmio', clubSlug: 'gremio',
    division: 'SERIE_A', cluster: 'A_MID',
    colorPrimary: '#0b56a5', colorSecondary: '#1a1a1a',
    fanbaseMillion: 10, nationalTitles: 2, recentPerformance: 7.0,
  },
  {
    ticker: 'FLU3', name: 'Fluminense', clubSlug: 'fluminense',
    division: 'SERIE_A', cluster: 'A_MID',
    colorPrimary: '#8b0000', colorSecondary: '#006400',
    fanbaseMillion: 8, nationalTitles: 1, recentPerformance: 7.8,
  },
  {
    ticker: 'CRU3', name: 'Cruzeiro', clubSlug: 'cruzeiro',
    division: 'SERIE_A', cluster: 'A_MID',
    colorPrimary: '#002fa7', colorSecondary: '#ffdd00',
    fanbaseMillion: 12, nationalTitles: 3, recentPerformance: 6.5,
  },
  {
    ticker: 'VAS3', name: 'Vasco da Gama', clubSlug: 'vasco',
    division: 'SERIE_A', cluster: 'A_MID',
    colorPrimary: '#1a1a1a', colorSecondary: '#ffffff',
    fanbaseMillion: 11, nationalTitles: 4, recentPerformance: 5.5,
  },
  {
    ticker: 'BOT3', name: 'Botafogo', clubSlug: 'botafogo',
    division: 'SERIE_A', cluster: 'A_MID',
    colorPrimary: '#1a1a1a', colorSecondary: '#c8c8c8',
    fanbaseMillion: 9, nationalTitles: 2, recentPerformance: 8.5,
  },
  {
    ticker: 'SAN3', name: 'Santos', clubSlug: 'santos',
    division: 'SERIE_A', cluster: 'A_MID',
    colorPrimary: '#1a1a1a', colorSecondary: '#ffffff',
    fanbaseMillion: 8, nationalTitles: 8, recentPerformance: 4.0,
  },
  {
    ticker: 'BAH3', name: 'Bahia', clubSlug: 'bahia',
    division: 'SERIE_A', cluster: 'A_SMALL',
    colorPrimary: '#003fa3', colorSecondary: '#cc0000',
    fanbaseMillion: 6, nationalTitles: 2, recentPerformance: 6.0,
  },
  {
    ticker: 'FOR3', name: 'Fortaleza', clubSlug: 'fortaleza',
    division: 'SERIE_A', cluster: 'A_SMALL',
    colorPrimary: '#003fa3', colorSecondary: '#cc0000',
    fanbaseMillion: 5, nationalTitles: 0, recentPerformance: 8.0,
  },
  {
    ticker: 'ACG3', name: 'Atlético Goianiense', clubSlug: 'atletico-go',
    division: 'SERIE_A', cluster: 'A_SMALL',
    colorPrimary: '#e65c00', colorSecondary: '#1a1a1a',
    fanbaseMillion: 2, nationalTitles: 0, recentPerformance: 6.5,
  },
  {
    ticker: 'CUI3', name: 'Cuiabá', clubSlug: 'cuiaba',
    division: 'SERIE_A', cluster: 'A_SMALL',
    colorPrimary: '#ffd700', colorSecondary: '#1a1a1a',
    fanbaseMillion: 1, nationalTitles: 0, recentPerformance: 5.0,
  },
  {
    ticker: 'BRG3', name: 'Bragantino', clubSlug: 'bragantino',
    division: 'SERIE_A', cluster: 'A_SMALL',
    colorPrimary: '#cc0000', colorSecondary: '#1a1a1a',
    fanbaseMillion: 2, nationalTitles: 0, recentPerformance: 7.5,
  },
  {
    ticker: 'VIT3', name: 'Vitória', clubSlug: 'vitoria',
    division: 'SERIE_A', cluster: 'A_SMALL',
    colorPrimary: '#cc0000', colorSecondary: '#1a1a1a',
    fanbaseMillion: 4, nationalTitles: 0, recentPerformance: 5.5,
  },
  {
    ticker: 'JUV3', name: 'Juventude', clubSlug: 'juventude',
    division: 'SERIE_A', cluster: 'A_SMALL',
    colorPrimary: '#006400', colorSecondary: '#ffffff',
    fanbaseMillion: 1, nationalTitles: 0, recentPerformance: 5.0,
  },
  {
    ticker: 'CRB3', name: 'CRB', clubSlug: 'crb',
    division: 'SERIE_A', cluster: 'A_SMALL',
    colorPrimary: '#cc0000', colorSecondary: '#1a1a1a',
    fanbaseMillion: 1, nationalTitles: 0, recentPerformance: 5.0,
  },
]

const SERIE_B_CLUBS: ClubSeedData[] = [
  {
    ticker: 'SPT3', name: 'Sport Recife', clubSlug: 'sport',
    division: 'SERIE_B', cluster: 'B_LIQUID',
    colorPrimary: '#cc0000', colorSecondary: '#1a1a1a',
    fanbaseMillion: 4, nationalTitles: 1, recentPerformance: 5.5,
  },
  {
    ticker: 'CGO3', name: 'Goiás', clubSlug: 'goias',
    division: 'SERIE_B', cluster: 'B_LIQUID',
    colorPrimary: '#006400', colorSecondary: '#ffffff',
    fanbaseMillion: 3, nationalTitles: 0, recentPerformance: 5.0,
  },
  {
    ticker: 'AVA3', name: 'Avaí', clubSlug: 'avai',
    division: 'SERIE_B', cluster: 'B_LIQUID',
    colorPrimary: '#003fa3', colorSecondary: '#ffffff',
    fanbaseMillion: 2, nationalTitles: 0, recentPerformance: 4.5,
  },
  {
    ticker: 'CHA3', name: 'Chapecoense', clubSlug: 'chapecoense',
    division: 'SERIE_B', cluster: 'B_LIQUID',
    colorPrimary: '#006400', colorSecondary: '#ffffff',
    fanbaseMillion: 3, nationalTitles: 0, recentPerformance: 4.0,
  },
  {
    ticker: 'VRD3', name: 'América Mineiro', clubSlug: 'america-mg',
    division: 'SERIE_B', cluster: 'B_LIQUID',
    colorPrimary: '#006400', colorSecondary: '#ffffff',
    fanbaseMillion: 3, nationalTitles: 1, recentPerformance: 5.5,
  },
  {
    ticker: 'CEC3', name: 'Ceará', clubSlug: 'ceara',
    division: 'SERIE_B', cluster: 'B_LIQUID',
    colorPrimary: '#1a1a1a', colorSecondary: '#ffffff',
    fanbaseMillion: 4, nationalTitles: 0, recentPerformance: 5.0,
  },
  {
    ticker: 'PAY3', name: 'Paysandu', clubSlug: 'paysandu',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#003fa3', colorSecondary: '#ffffff',
    fanbaseMillion: 2, nationalTitles: 0, recentPerformance: 4.0,
  },
  {
    ticker: 'MIR3', name: 'Mirassol', clubSlug: 'mirassol',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#cc0000', colorSecondary: '#1a1a1a',
    fanbaseMillion: 1, nationalTitles: 0, recentPerformance: 4.5,
  },
  {
    ticker: 'SAM3', name: 'Sampaio Corrêa', clubSlug: 'sampaio-correa',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#003fa3', colorSecondary: '#cc0000',
    fanbaseMillion: 1, nationalTitles: 0, recentPerformance: 4.0,
  },
  {
    ticker: 'FIG3', name: 'Figueirense', clubSlug: 'figueirense',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#1a1a1a', colorSecondary: '#ffffff',
    fanbaseMillion: 2, nationalTitles: 0, recentPerformance: 3.5,
  },
  {
    ticker: 'NAU3', name: 'Náutico', clubSlug: 'nautico',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#cc0000', colorSecondary: '#1a1a1a',
    fanbaseMillion: 2, nationalTitles: 0, recentPerformance: 3.5,
  },
  {
    ticker: 'PON3', name: 'Ponte Preta', clubSlug: 'ponte-preta',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#1a1a1a', colorSecondary: '#ffffff',
    fanbaseMillion: 2, nationalTitles: 0, recentPerformance: 4.0,
  },
  {
    ticker: 'CFC3', name: 'Coritiba', clubSlug: 'coritiba',
    division: 'SERIE_B', cluster: 'B_LIQUID',
    colorPrimary: '#006400', colorSecondary: '#ffffff',
    fanbaseMillion: 4, nationalTitles: 1, recentPerformance: 5.0,
  },
  {
    ticker: 'OPE3', name: 'Operário PR', clubSlug: 'operario-pr',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#1a1a1a', colorSecondary: '#ffffff',
    fanbaseMillion: 1, nationalTitles: 0, recentPerformance: 4.0,
  },
  {
    ticker: 'GOI3', name: 'Goianiense', clubSlug: 'goianiense',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#e65c00', colorSecondary: '#1a1a1a',
    fanbaseMillion: 2, nationalTitles: 0, recentPerformance: 4.5,
  },
  {
    ticker: 'GUA3', name: 'Guarani', clubSlug: 'guarani',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#006400', colorSecondary: '#ffffff',
    fanbaseMillion: 1, nationalTitles: 0, recentPerformance: 3.5,
  },
  {
    ticker: 'BTC3', name: 'Botafogo SP', clubSlug: 'botafogo-sp',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#1a1a1a', colorSecondary: '#cc0000',
    fanbaseMillion: 1, nationalTitles: 0, recentPerformance: 4.0,
  },
  {
    ticker: 'MRG3', name: 'Murici', clubSlug: 'murici',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#cc0000', colorSecondary: '#006400',
    fanbaseMillion: 0.5, nationalTitles: 0, recentPerformance: 3.0,
  },
  {
    ticker: 'PMB3', name: 'Paraná Clube', clubSlug: 'parana',
    division: 'SERIE_B', cluster: 'B_ILLIQ',
    colorPrimary: '#003fa3', colorSecondary: '#cc0000',
    fanbaseMillion: 2, nationalTitles: 0, recentPerformance: 3.5,
  },
  {
    ticker: 'VIT4', name: 'Vitória BA (Série B)', clubSlug: 'vitoria-b',
    division: 'SERIE_B', cluster: 'B_LIQUID',
    colorPrimary: '#cc0000', colorSecondary: '#1a1a1a',
    fanbaseMillion: 3, nationalTitles: 0, recentPerformance: 5.0,
  },
]

export async function seedAssets() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:assets] Seeds não executam em produção.')
  }

  const allClubs = [...SERIE_A_CLUBS, ...SERIE_B_CLUBS]

  for (const club of allClubs) {
    const price = calcPrice(club)
    await prisma.asset.upsert({
      where: { ticker: club.ticker },
      create: {
        ticker: club.ticker,
        name: club.name,
        clubSlug: club.clubSlug,
        division: club.division,
        cluster: club.cluster,
        colorPrimary: club.colorPrimary,
        colorSecondary: club.colorSecondary,
        currentPrice: price,
        openPrice: price,
        closePrice: price,
        marketCap: price * 1_000_000,
        volume: BigInt(0),
        isActive: true,
      },
      update: {
        name: club.name,
        division: club.division,
        cluster: club.cluster,
        colorPrimary: club.colorPrimary,
        colorSecondary: club.colorSecondary,
      },
    })
  }

  console.log(`[seed:assets] ${allClubs.length} assets sincronizados (20 Série A + 20 Série B)`)
}
