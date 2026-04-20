// T-02: Ensure COL3 asset exists in database
// Run: npx ts-node prisma/seeds/ensure-col3.ts

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🔍 T-02: Verificando COL3 no banco de dados...')

  // Verificar se COL3 existe na tabela Asset
  const existingAsset = await prisma.asset.findUnique({
    where: { ticker: 'COL3' },
  })

  if (existingAsset) {
    console.log('✓ COL3 já existe no banco')
    if (!existingAsset.isActive) {
      console.log('  ⚠ COL3 está inativo (isActive=false). Ativando...')
      await prisma.asset.update({
        where: { ticker: 'COL3' },
        data: { isActive: true },
      })
      console.log('  ✓ COL3 ativado')
    }
    return
  }

  // COL3 não existe, criar com dados padrão
  console.log('  ✗ COL3 não encontrado. Criando asset...')

  const col3 = await prisma.asset.create({
    data: {
      ticker: 'COL3',
      displayName: 'Colo-Colo',
      realName: 'Colo-Colo S.A.',
      division: 'SERIE_A',
      cluster: 'A_TOP',
      currentPrice: '10.50',
      openPrice: '10.50',
      closePrice: '10.50',
      currentSupply: 1000000,
      totalShares: 100000000,
      marketCap: '105000000',
      colorPrimary: '#000000',
      colorSecondary: '#FFFFFF',
      fairValue: '12.00',
      isActive: true,
      isHalted: false,
      sentiment: 'NEUTRAL',
      searchText: 'colo colo chileno',
      clubSlug: 'colo-colo',
    },
  })

  console.log(`✓ COL3 criado com sucesso:`)
  console.log(`  - Ticker: ${col3.ticker}`)
  console.log(`  - Display: ${col3.displayName}`)
  console.log(`  - Preço: ${col3.currentPrice}`)
  console.log(`  - Status: ${col3.isActive ? 'Ativo' : 'Inativo'}`)
}

main()
  .then(() => {
    console.log('✓ Seed COL3 completo')
    process.exit(0)
  })
  .catch((err) => {
    console.error('✗ Erro durante seed:', err)
    process.exit(1)
  })
