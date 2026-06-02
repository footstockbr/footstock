import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

interface AliasSeedEntry {
  alias: string
  assetTicker: string
}

// Mapeamento: alias (ticker mundo-real ou variante) → ticker canônico da plataforma
const ALIAS_SEED: AliasSeedEntry[] = [
  // Flamengo → URU3
  { alias: 'FLA3', assetTicker: 'URU3' },
  { alias: 'FLA4', assetTicker: 'URU3' },
  { alias: 'FLM3', assetTicker: 'URU3' },
  { alias: 'FLM4', assetTicker: 'URU3' },
  // Palmeiras → POR3
  { alias: 'PAL3', assetTicker: 'POR3' },
  { alias: 'PAL4', assetTicker: 'POR3' },
  { alias: 'PALM4', assetTicker: 'POR3' },
  // Corinthians → TIM3
  { alias: 'COR3', assetTicker: 'TIM3' },
  { alias: 'COR4', assetTicker: 'TIM3' },
  { alias: 'CORI4', assetTicker: 'TIM3' },
  // São Paulo → TRI3
  { alias: 'SAO3', assetTicker: 'TRI3' },
  { alias: 'SPFC4', assetTicker: 'TRI3' },
  // Atlético-MG → GAL3
  { alias: 'CAM3', assetTicker: 'GAL3' },
  { alias: 'ATL3', assetTicker: 'GAL3' },
  { alias: 'ATL4', assetTicker: 'GAL3' },
  // Botafogo → FOG3
  { alias: 'BOT3', assetTicker: 'FOG3' },
  { alias: 'BOT4', assetTicker: 'FOG3' },
  { alias: 'BOFA4', assetTicker: 'FOG3' },
  // Internacional → COL3
  { alias: 'INT3', assetTicker: 'COL3' },
  { alias: 'INT4', assetTicker: 'COL3' },
  { alias: 'INTER4', assetTicker: 'COL3' },
  // Grêmio → IMO3
  { alias: 'GRE3', assetTicker: 'IMO3' },
  { alias: 'GRE4', assetTicker: 'IMO3' },
  { alias: 'GREM4', assetTicker: 'IMO3' },
  // Cruzeiro → RAP3
  { alias: 'CRU3', assetTicker: 'RAP3' },
  { alias: 'CRU4', assetTicker: 'RAP3' },
  // Vasco → MAL3
  { alias: 'VAS3', assetTicker: 'MAL3' },
  { alias: 'VAS4', assetTicker: 'MAL3' },
  // Bahia → TFN3
  { alias: 'BAH3', assetTicker: 'TFN3' },
  { alias: 'BAH4', assetTicker: 'TFN3' },
  // Fluminense → GUE3
  { alias: 'FLU3', assetTicker: 'GUE3' },
  { alias: 'FLU4', assetTicker: 'GUE3' },
  // RB Bragantino → RBB3
  { alias: 'RBB4', assetTicker: 'RBB3' },
  { alias: 'BRAG3', assetTicker: 'RBB3' },
  // Fortaleza → FOR3
  { alias: 'FOR4', assetTicker: 'FOR3' },
  { alias: 'FORT3', assetTicker: 'FOR3' },
  // Santos → BAL3
  { alias: 'SAN3', assetTicker: 'BAL3' },
  { alias: 'SAN4', assetTicker: 'BAL3' },
  // Athletico-PR → FUR3
  { alias: 'CAP3', assetTicker: 'FUR3' },
  { alias: 'CAP4', assetTicker: 'FUR3' },
  { alias: 'ATH3', assetTicker: 'FUR3' },
  // Cuiabá → CUI3
  { alias: 'CUI4', assetTicker: 'CUI3' },
  // Vitória → VIT3
  { alias: 'VIT4', assetTicker: 'VIT3' },
  // Juventude → JUV3
  { alias: 'JUV4', assetTicker: 'JUV3' },
  // Mirassol → MIR3
  { alias: 'MIR4', assetTicker: 'MIR3' },
  // Sport Recife → LEI3
  { alias: 'SPT3', assetTicker: 'LEI3' },
  { alias: 'SPT4', assetTicker: 'LEI3' },
  // Novorizontino → NTL3
  { alias: 'NOV3', assetTicker: 'NTL3' },
  // Avaí → AVA3
  { alias: 'AVA4', assetTicker: 'AVA3' },
  // Goiás → GOI3
  { alias: 'GOI4', assetTicker: 'GOI3' },
  // Chapecoense → CHA3
  { alias: 'CHA4', assetTicker: 'CHA3' },
  // Ponte Preta → PON3
  { alias: 'PON4', assetTicker: 'PON3' },
  // Guarani → GUA3
  { alias: 'GUA4', assetTicker: 'GUA3' },
  // Operário-PR → OPE3
  { alias: 'OPE4', assetTicker: 'OPE3' },
  // Paysandu → PAY3
  { alias: 'PAY4', assetTicker: 'PAY3' },
  // Coritiba → CFC3 (COR4 já usado por Corinthians, usar CFC4 e CORI3 como variantes)
  { alias: 'CFC4', assetTicker: 'CFC3' },
  { alias: 'CORI3', assetTicker: 'CFC3' },
  // América-MG → AME3
  { alias: 'AME4', assetTicker: 'AME3' },
  // Botafogo-SP → BSA3
  { alias: 'BSA4', assetTicker: 'BSA3' },
  // CRB → CRB3
  { alias: 'CRB4', assetTicker: 'CRB3' },
  // Ituano → ITA3
  { alias: 'ITA4', assetTicker: 'ITA3' },
  // Tombense → TON3
  { alias: 'TON4', assetTicker: 'TON3' },
  // Vila Nova → TIS3
  { alias: 'VNO3', assetTicker: 'TIS3' },
  { alias: 'VIL3', assetTicker: 'TIS3' },
  // Sampaio Corrêa → SAM3
  { alias: 'SAM4', assetTicker: 'SAM3' },
  { alias: 'SAMP3', assetTicker: 'SAM3' },
  // Londrina → LON3
  { alias: 'LON4', assetTicker: 'LON3' },
  { alias: 'LOND3', assetTicker: 'LON3' },
  // Figueirense → FIG3
  { alias: 'FIG4', assetTicker: 'FIG3' },
  { alias: 'FIGU3', assetTicker: 'FIG3' },
  // CSA → CSA3
  { alias: 'CSA4', assetTicker: 'CSA3' },
]

export async function seedAssetAliases() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:assetAliases] Seeds não executam em produção.')
  }

  const activeTickers = new Set(ALIAS_SEED.map((a) => a.alias))

  // Desativar aliases removidos da lista canônica
  await prisma.assetAlias.updateMany({
    where: { alias: { notIn: [...activeTickers] } },
    data: { isActive: false },
  })

  for (const entry of ALIAS_SEED) {
    await prisma.assetAlias.upsert({
      where: { alias: entry.alias },
      create: {
        alias: entry.alias,
        assetTicker: entry.assetTicker,
        isActive: true,
      },
      update: {
        assetTicker: entry.assetTicker,
        isActive: true,
      },
    })
  }

  console.log(`[seed:assetAliases] ${ALIAS_SEED.length} aliases sincronizados.`)
}
