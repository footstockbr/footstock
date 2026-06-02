/**
 * Seed: 40 ativos de demonstração para trading
 * Module: module-23-admin-usuarios-financeiro / TASK-5
 *
 * 20 Série A + 20 Série B com clusters, cores e aliases.
 * fairValue (= Preço IPO) e número de cotas vêm da tabela canônica de
 * precificação IPO 2026 (IPO_PRICING_2026) — doc "Fundamentos Econômico-
 * Financeiros e Precificação IPO" (Convocados 2025). marketCap = fairValue × cotas.
 *
 * GUARD: Não executar em produção
 */

import type { PrismaClient } from '@prisma/client'
// Import relativo (não @/): seeds rodam via tsx sem resolução de path alias.
import { IPO_PRICING_2026 } from '../../../src/lib/constants/ipo-pricing-2026'

interface AssetDef {
  ticker: string
  name: string
  clubSlug: string
  division: 'SERIE_A' | 'SERIE_B'
  cluster: 'A_TOP' | 'A_MID' | 'A_SMALL' | 'B_LIQUID' | 'B_ILLIQ'
  colorPrimary: string
  colorSecondary: string
  searchText: string // aliases internos — nunca retornar ao cliente
}

// ─── Série A ──────────────────────────────────────────────────────────────────

const SERIE_A: AssetDef[] = [
  // A_TOP — 5 clubes de maior torcida/valor
  { ticker: 'URU3', name: 'Urubu da Gavea FC',              clubSlug: 'urubu',      division: 'SERIE_A', cluster: 'A_TOP',   colorPrimary: '#CC0000', colorSecondary: '#000000', searchText: 'flamengo rj urubu mengao' },
  { ticker: 'POR4', name: 'Porco do Parque FC',             clubSlug: 'porco',      division: 'SERIE_A', cluster: 'A_TOP',   colorPrimary: '#006437', colorSecondary: '#FFFFFF', searchText: 'palmeiras sp porco verdao' },
  { ticker: 'TIM3', name: 'Timao do Sao Jorge FC',          clubSlug: 'timao',      division: 'SERIE_A', cluster: 'A_TOP',   colorPrimary: '#111111', colorSecondary: '#FFFFFF', searchText: 'corinthians sp timao fiel' },
  { ticker: 'GAL3', name: 'Galo da Lagoinha FC',            clubSlug: 'galo',       division: 'SERIE_A', cluster: 'A_TOP',   colorPrimary: '#1A1A1A', colorSecondary: '#808080', searchText: 'atletico mineiro mg galo galo doido' },
  { ticker: 'TRI4', name: 'Tricolor do Morumbi FC',         clubSlug: 'tricolor',   division: 'SERIE_A', cluster: 'A_TOP',   colorPrimary: '#E30000', colorSecondary: '#FFFFFF', searchText: 'sao paulo fc sp tricolor morumbi' },

  // A_MID — 7 clubes de grande torcida
  { ticker: 'FOG3', name: 'Estrela do General FC',          clubSlug: 'estrela',    division: 'SERIE_A', cluster: 'A_MID',   colorPrimary: '#1C1C1C', colorSecondary: '#E8E8E8', searchText: 'botafogo rj fogao estrela solitaria' },
  { ticker: 'COL3', name: 'Colorado do Beira-Rio FC',       clubSlug: 'colorado',   division: 'SERIE_A', cluster: 'A_MID',   colorPrimary: '#CC0000', colorSecondary: '#FFFFFF', searchText: 'internacional rs colorado inter colorado' },
  { ticker: 'IMO3', name: 'Imortal da Arena FC',            clubSlug: 'imortal',    division: 'SERIE_A', cluster: 'A_MID',   colorPrimary: '#1F4F7F', colorSecondary: '#000000', searchText: 'gremio rs imortal tricolor gaucho' },
  { ticker: 'RAP3', name: 'Raposa do Mineirao FC',          clubSlug: 'raposa',     division: 'SERIE_A', cluster: 'A_MID',   colorPrimary: '#1A237E', colorSecondary: '#1E88E5', searchText: 'cruzeiro mg raposa celeste' },
  { ticker: 'GUE4', name: 'Guerreiro das Laranjeiras FC',   clubSlug: 'guerreiro',  division: 'SERIE_A', cluster: 'A_MID',   colorPrimary: '#6B0000', colorSecondary: '#00B140', searchText: 'fluminense rj flu tricolor das laranjeiras' },
  { ticker: 'TRI3', name: 'Tricolor da Fonte Nova FC',      clubSlug: 'fontenova',  division: 'SERIE_A', cluster: 'A_MID',   colorPrimary: '#2196F3', colorSecondary: '#CC0000', searchText: 'bahia ba tricolor esquadrao' },
  { ticker: 'BAL4', name: 'Baleia da Vila Belmiro FC',      clubSlug: 'baleia',     division: 'SERIE_A', cluster: 'A_MID',   colorPrimary: '#FFFFFF', colorSecondary: '#000000', searchText: 'santos sp peixe baleia vila belmiro' },

  // A_SMALL — 8 clubes de torcida intermediária/menor
  { ticker: 'MAL4', name: 'Cruz de Malta FC',               clubSlug: 'malta',      division: 'SERIE_A', cluster: 'A_SMALL', colorPrimary: '#000000', colorSecondary: '#CCCCCC', searchText: 'vasco rj cruz de malta sao januario' },
  { ticker: 'TOR3', name: 'Touro do Nabi FC',               clubSlug: 'touro',      division: 'SERIE_A', cluster: 'A_SMALL', colorPrimary: '#CC0000', colorSecondary: '#000000', searchText: 'bragantino sp touro red bull bragantino' },
  { ticker: 'FUR3', name: 'Furacao do Capao FC',            clubSlug: 'furacao',    division: 'SERIE_A', cluster: 'A_SMALL', colorPrimary: '#CC0000', colorSecondary: '#000000', searchText: 'athletico paranaense pr furacao rubro-negro' },
  { ticker: 'LEM3', name: 'Leaozinho do Maiao FC',          clubSlug: 'leaozinho',  division: 'SERIE_A', cluster: 'A_SMALL', colorPrimary: '#F5A623', colorSecondary: '#000000', searchText: 'mirassol sp leaozinho' },
  { ticker: 'VOA4', name: 'Vovo Alemao do Couto FC',        clubSlug: 'vovo',       division: 'SERIE_A', cluster: 'A_SMALL', colorPrimary: '#006400', colorSecondary: '#FFFFFF', searchText: 'coritiba pr vovo coxa branca' },
  { ticker: 'LEB3', name: 'Leao da Barra FC',               clubSlug: 'barra',      division: 'SERIE_A', cluster: 'A_SMALL', colorPrimary: '#CC0000', colorSecondary: '#000000', searchText: 'vitoria ba leao rubro negro baiano' },
  { ticker: 'CON3', name: 'Conda da Arena Verde FC',        clubSlug: 'conda',      division: 'SERIE_A', cluster: 'A_SMALL', colorPrimary: '#007700', colorSecondary: '#FFFFFF', searchText: 'chapecoense sc conda verdao' },
  { ticker: 'LEA3', name: 'Leao Azul do Baenao FC',         clubSlug: 'leaoazul',   division: 'SERIE_A', cluster: 'A_SMALL', colorPrimary: '#1C4FBF', colorSecondary: '#FFFFFF', searchText: 'remo pa leao azul baenao' },
]

// ─── Série B ──────────────────────────────────────────────────────────────────

const SERIE_B: AssetDef[] = [
  // B_LIQUID — 10 clubes com liquidez aceitável
  { ticker: 'COE3', name: 'Coelho do Calafate FC',          clubSlug: 'coelho',     division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#00823A', colorSecondary: '#FFFFFF', searchText: 'america mineiro mg coelho' },
  { ticker: 'LEP4', name: 'Leao do Pici FC',                clubSlug: 'leaopici',   division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#CC0000', colorSecondary: '#1C4FBF', searchText: 'fortaleza ce leao pici tricolor cearense' },
  { ticker: 'DRA3', name: 'Dragao do Cerradao FC',          clubSlug: 'dragao',     division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#CC0000', colorSecondary: '#000000', searchText: 'atletico goianiense go dragao' },
  { ticker: 'VOZ3', name: 'Vovo do Castelao FC',            clubSlug: 'castelao',   division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#000000', colorSecondary: '#FFFFFF', searchText: 'ceara sc vovo castelao' },
  { ticker: 'PER3', name: 'Periquito da Serrinha FC',       clubSlug: 'periquito',  division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#006437', colorSecondary: '#FFFFFF', searchText: 'goias go periquito verdao goiano' },
  { ticker: 'GAP3', name: 'Galo da Pajucara FC',            clubSlug: 'pajucara',   division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#006400', colorSecondary: '#CC0000', searchText: 'crb alagoas galo pajucara' },
  { ticker: 'LEI3', name: 'Leao da Ilha do Retiro FC',      clubSlug: 'retiro',     division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#CC0000', colorSecondary: '#000000', searchText: 'sport recife pe leao ilha retiro' },
  { ticker: 'IND4', name: 'Indio da Serra Gaucha FC',       clubSlug: 'indio',      division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#006437', colorSecondary: '#CC0000', searchText: 'juventude rs indio gaucho' },
  { ticker: 'PAN3', name: 'Pantera da Mogiana FC',          clubSlug: 'pantera',    division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#000000', colorSecondary: '#FFFFFF', searchText: 'botafogo sp pantera mogiana' },
  { ticker: 'CAV4', name: 'Cavalo de Tiradentes FC',        clubSlug: 'cavalo',     division: 'SERIE_B', cluster: 'B_LIQUID', colorPrimary: '#1C4FBF', colorSecondary: '#FFFFFF', searchText: 'tombense mg cavalo tiradentes' },

  // B_ILLIQ — 10 clubes com baixa liquidez
  { ticker: 'LEI4', name: 'Leao da Ilha FC',                clubSlug: 'lhailha',    division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#1C4FBF', colorSecondary: '#FFFFFF', searchText: 'avai sc leao ilha florianopolis' },
  { ticker: 'TIG4', name: 'Tigre do Heriberto FC',          clubSlug: 'heriberto',  division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#CC0000', colorSecondary: '#FFFFFF', searchText: 'joinville sc tigre heriberto hulse' },
  { ticker: 'DOU4', name: 'Dourado do Pantanal FC',         clubSlug: 'pantanal',   division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#FFD700', colorSecondary: '#00823A', searchText: 'cuiaba mt dourado pantanal' },
  { ticker: 'TUB3', name: 'Tubarao do Cafe FC',             clubSlug: 'tubarao',    division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#006437', colorSecondary: '#000000', searchText: 'guarani sp tubarao bugre' },
  { ticker: 'NAF3', name: 'Timbu dos Aflitos FC',           clubSlug: 'timbu',      division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#CC0000', colorSecondary: '#FFFFFF', searchText: 'nautico pe timbu aflitos' },
  { ticker: 'TIV3', name: 'Tigre do Vale do Peixe FC',      clubSlug: 'valeiopeixe',division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#000000', colorSecondary: '#00823A', searchText: 'cri sao paulo sc tigre' },
  { ticker: 'FAS3', name: 'Fantasma dos Campos Gerais FC',  clubSlug: 'fantasma',   division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#000000', colorSecondary: '#FFFFFF', searchText: 'operario pr fantasma campos gerais' },
  { ticker: 'MAC4', name: 'Macaca do Majestoso FC',         clubSlug: 'macaca',     division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#000000', colorSecondary: '#FFFFFF', searchText: 'ponte preta sp macaca majestoso' },
  { ticker: 'ABT4', name: 'Tigre do Grande ABC FC',         clubSlug: 'grandeabc',  division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#CC0000', colorSecondary: '#000000', searchText: 'sao bernardo sp tigre abc' },
  { ticker: 'TIS3', name: 'Tigre da Serra Dourada FC',      clubSlug: 'serradoura', division: 'SERIE_B', cluster: 'B_ILLIQ',  colorPrimary: '#CC0000', colorSecondary: '#000000', searchText: 'vila nova go tigre serra dourada' },
]

const ALL_ASSETS: AssetDef[] = [...SERIE_A, ...SERIE_B]

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

  let created = 0
  for (const asset of ALL_ASSETS) {
    try {
      const pricing = IPO_PRICING_2026[asset.ticker]
      if (!pricing) {
        console.warn(`[seed]   ⚠ ${asset.ticker} sem entrada em IPO_PRICING_2026 — pulando`)
        continue
      }
      const price = pricing.fairValue  // currentPrice = fairValue (warm start — evita CB no 1º tick)
      const shares = pricing.shares    // cotas variáveis por clube (Passo 5 da metodologia)
      const marketCap = parseFloat((price * shares).toFixed(2))

      await prisma.asset.create({
        data: {
          ticker: asset.ticker,
          displayName: asset.name,
          clubSlug: asset.clubSlug,
          division: asset.division,
          cluster: asset.cluster,
          currentPrice: price,
          openPrice: price,
          closePrice: price,
          fairValue: price,
          marketCap,
          currentSupply: BigInt(shares),
          totalShares: BigInt(shares),
          colorPrimary: asset.colorPrimary,
          colorSecondary: asset.colorSecondary,
          searchText: asset.searchText,
          sentiment: 'NEUTRAL',
          financials: {
            ipoPrice: price,
            equityValue: marketCap,
            rating: pricing.rating,
            totalShares: shares,
            estimated: pricing.estimated ?? false,
          },
        },
      })

      const divLabel = asset.division === 'SERIE_A' ? 'A' : 'B'
      console.log(`[seed]   ✓ ${asset.ticker} [${asset.cluster}] Série ${divLabel} — R$${price.toFixed(2)} (fairValue)`)
      created++
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        console.log(`[seed]   ~ ${asset.ticker} já existe no banco`)
      } else {
        throw error
      }
    }
  }

  console.log(`[seed] Seed de ativos concluído — ${created} ativos criados (${SERIE_A.length} Série A + ${SERIE_B.length} Série B)`)
}
