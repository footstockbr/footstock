import { prisma } from '@/lib/prisma'

/**
 * Aliases de ticker: mapeia códigos populares do mundo real para tickers fictícios do sistema.
 *
 * Formato: { alias: 'FLA3', assetTicker: 'URU3' }
 *
 * Regras:
 * - Aliases em maiúsculas (normalizado)
 * - Um alias aponta para exatamente um ticker canônico
 * - O ticker canônico NÃO aparece como alias de si mesmo (não redundante)
 * - Cobertos: sufixos 3, 4, 11 + variações históricas
 */
const ALIAS_MAP: Array<{ alias: string; assetTicker: string }> = [
  // URU3 = Flamengo
  { alias: 'FLA3',  assetTicker: 'URU3' },
  { alias: 'FLA4',  assetTicker: 'URU3' },
  { alias: 'FLA11', assetTicker: 'URU3' },
  { alias: 'FLM3',  assetTicker: 'URU3' },
  { alias: 'FLM4',  assetTicker: 'URU3' },

  // POR3 = Palmeiras
  { alias: 'PAL3',  assetTicker: 'POR3' },
  { alias: 'PAL4',  assetTicker: 'POR3' },
  { alias: 'PAL11', assetTicker: 'POR3' },
  { alias: 'SEP3',  assetTicker: 'POR3' },

  // TIM3 = Corinthians
  { alias: 'COR3',  assetTicker: 'TIM3' },
  { alias: 'COR4',  assetTicker: 'TIM3' },
  { alias: 'COR11', assetTicker: 'TIM3' },
  { alias: 'SCR3',  assetTicker: 'TIM3' },

  // TRI3 = São Paulo
  { alias: 'SAO3',  assetTicker: 'TRI3' },
  { alias: 'SAO4',  assetTicker: 'TRI3' },
  { alias: 'SAO11', assetTicker: 'TRI3' },
  { alias: 'SPF3',  assetTicker: 'TRI3' },

  // GAL3 = Atlético-MG
  { alias: 'CAM3',  assetTicker: 'GAL3' },
  { alias: 'CAM4',  assetTicker: 'GAL3' },
  { alias: 'CAM11', assetTicker: 'GAL3' },
  { alias: 'ATM3',  assetTicker: 'GAL3' },

  // IMO3 = Grêmio
  { alias: 'GRE3',  assetTicker: 'IMO3' },
  { alias: 'GRE4',  assetTicker: 'IMO3' },
  { alias: 'GRE11', assetTicker: 'IMO3' },
  { alias: 'GBP3',  assetTicker: 'IMO3' },

  // COL3 = Internacional
  { alias: 'INT3',  assetTicker: 'COL3' },
  { alias: 'INT4',  assetTicker: 'COL3' },
  { alias: 'INT11', assetTicker: 'COL3' },
  { alias: 'SCI3',  assetTicker: 'COL3' },

  // GUE3 = Fluminense
  { alias: 'FLU3',  assetTicker: 'GUE3' },
  { alias: 'FLU4',  assetTicker: 'GUE3' },
  { alias: 'FLU11', assetTicker: 'GUE3' },

  // BAL3 = Santos
  { alias: 'SAN3',  assetTicker: 'BAL3' },
  { alias: 'SAN4',  assetTicker: 'BAL3' },
  { alias: 'SAN11', assetTicker: 'BAL3' },

  // MAL3 = Vasco da Gama
  { alias: 'VAS3',  assetTicker: 'MAL3' },
  { alias: 'VAS4',  assetTicker: 'MAL3' },
  { alias: 'VAS11', assetTicker: 'MAL3' },
  { alias: 'CRV3',  assetTicker: 'MAL3' },

  // FOG3 = Botafogo
  { alias: 'BOT3',  assetTicker: 'FOG3' },
  { alias: 'BOT4',  assetTicker: 'FOG3' },
  { alias: 'BOT11', assetTicker: 'FOG3' },
  { alias: 'BFR3',  assetTicker: 'FOG3' },

  // FUR3 = Athletico-PR
  { alias: 'CAP3',  assetTicker: 'FUR3' },
  { alias: 'CAP4',  assetTicker: 'FUR3' },
  { alias: 'CAP11', assetTicker: 'FUR3' },
  { alias: 'ATH3',  assetTicker: 'FUR3' },

  // FOR3 = Fortaleza
  { alias: 'FEC3',  assetTicker: 'FOR3' },
  { alias: 'FEC4',  assetTicker: 'FOR3' },
  { alias: 'FEC11', assetTicker: 'FOR3' },

  // TFN3 = Bahia
  { alias: 'BAH3',  assetTicker: 'TFN3' },
  { alias: 'BAH4',  assetTicker: 'TFN3' },
  { alias: 'BAH11', assetTicker: 'TFN3' },
  { alias: 'ECB3',  assetTicker: 'TFN3' },

  // RAP3 = Cruzeiro
  { alias: 'CRU3',  assetTicker: 'RAP3' },
  { alias: 'CRU4',  assetTicker: 'RAP3' },
  { alias: 'CRU11', assetTicker: 'RAP3' },
  { alias: 'CEC3',  assetTicker: 'RAP3' },

  // RBB3 = RB Bragantino
  { alias: 'BRG3',  assetTicker: 'RBB3' },
  { alias: 'BRG4',  assetTicker: 'RBB3' },
  { alias: 'RBB4',  assetTicker: 'RBB3' },

  // CUI3 = Cuiabá
  { alias: 'CUI4',  assetTicker: 'CUI3' },
  { alias: 'CEC4',  assetTicker: 'CUI3' },

  // VIT3 = Vitória
  { alias: 'VIT4',  assetTicker: 'VIT3' },
  { alias: 'ECV3',  assetTicker: 'VIT3' },

  // JUV3 = Juventude
  { alias: 'JUV4',  assetTicker: 'JUV3' },
  { alias: 'ECJ3',  assetTicker: 'JUV3' },

  // MIR3 = Mirassol
  { alias: 'MIR4',  assetTicker: 'MIR3' },
  { alias: 'MFC3',  assetTicker: 'MIR3' },

  // --- Série B ---

  // LEI3 = Sport Recife
  { alias: 'SPR3',  assetTicker: 'LEI3' },
  { alias: 'SPR4',  assetTicker: 'LEI3' },
  { alias: 'SCD3',  assetTicker: 'LEI3' },

  // NTL3 = Novorizontino
  { alias: 'NVH3',  assetTicker: 'NTL3' },
  { alias: 'GNH3',  assetTicker: 'NTL3' },

  // AVA3 = Avaí
  { alias: 'AVA4',  assetTicker: 'AVA3' },
  { alias: 'AFC3',  assetTicker: 'AVA3' },

  // GOI3 = Goiás
  { alias: 'GOI4',  assetTicker: 'GOI3' },
  { alias: 'GEC3',  assetTicker: 'GOI3' },

  // CHA3 = Chapecoense
  { alias: 'CHA4',  assetTicker: 'CHA3' },
  { alias: 'ACH3',  assetTicker: 'CHA3' },

  // PON3 = Ponte Preta
  { alias: 'PON4',  assetTicker: 'PON3' },
  { alias: 'AAP3',  assetTicker: 'PON3' },

  // GUA3 = Guarani
  { alias: 'GUA4',  assetTicker: 'GUA3' },
  { alias: 'GFC3',  assetTicker: 'GUA3' },

  // OPE3 = Operário-PR
  { alias: 'OPE4',  assetTicker: 'OPE3' },
  { alias: 'OFC3',  assetTicker: 'OPE3' },

  // SAM3 = Sampaio Corrêa
  { alias: 'SAM4',  assetTicker: 'SAM3' },
  { alias: 'SCF3',  assetTicker: 'SAM3' },

  // TIS3 = Vila Nova
  { alias: 'VNF3',  assetTicker: 'TIS3' },
  { alias: 'VNF4',  assetTicker: 'TIS3' },

  // LON3 = Londrina
  { alias: 'LEC3',  assetTicker: 'LON3' },
  { alias: 'LON4',  assetTicker: 'LON3' },

  // FIG3 = Figueirense
  { alias: 'FIG4',  assetTicker: 'FIG3' },
  { alias: 'FFC3',  assetTicker: 'FIG3' },

  // PAY3 = Paysandu
  { alias: 'PAY4',  assetTicker: 'PAY3' },
  { alias: 'PSC3',  assetTicker: 'PAY3' },

  // CFC3 = Coritiba
  { alias: 'CFC4',  assetTicker: 'CFC3' },
  { alias: 'CFB3',  assetTicker: 'CFC3' },

  // AME3 = América-MG
  { alias: 'AME4',  assetTicker: 'AME3' },
  { alias: 'AMG3',  assetTicker: 'AME3' },

  // BSA3 = Botafogo-SP
  { alias: 'BSA4',  assetTicker: 'BSA3' },
  { alias: 'BFC3',  assetTicker: 'BSA3' },

  // CRB3 = CRB
  { alias: 'CRB4',  assetTicker: 'CRB3' },

  // CSA3 = CSA
  { alias: 'CSA4',  assetTicker: 'CSA3' },

  // ITA3 = Ituano
  { alias: 'ITU3',  assetTicker: 'ITA3' },
  { alias: 'IFC3',  assetTicker: 'ITA3' },

  // TON3 = Tombense
  { alias: 'TBN3',  assetTicker: 'TON3' },
  { alias: 'TFC3',  assetTicker: 'TON3' },
]

export async function seedAssetAliases() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:assetAliases] Seeds não executam em produção.')
  }

  let created = 0
  let updated = 0

  for (const entry of ALIAS_MAP) {
    const alias = entry.alias.toUpperCase()
    const existing = await prisma.assetAlias.findUnique({ where: { alias } })

    if (!existing) {
      await prisma.assetAlias.create({
        data: {
          id: `alias_${alias.toLowerCase()}`,
          alias,
          assetTicker: entry.assetTicker,
          isActive: true,
        },
      })
      created++
    } else if (existing.assetTicker !== entry.assetTicker || !existing.isActive) {
      await prisma.assetAlias.update({
        where: { alias },
        data: { assetTicker: entry.assetTicker, isActive: true },
      })
      updated++
    }
  }

  // Desativar aliases removidos da lista canônica
  const canonicalAliases = ALIAS_MAP.map((e) => e.alias.toUpperCase())
  const deactivated = await prisma.assetAlias.updateMany({
    where: { alias: { notIn: canonicalAliases }, isActive: true },
    data: { isActive: false },
  })

  console.log(
    `[seed:assetAliases] ${created} criados, ${updated} atualizados, ${deactivated.count} desativados (${ALIAS_MAP.length} aliases canônicos)`
  )
}
