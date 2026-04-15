/**
 * Seed principal — footstock-next.
 *
 * Ordem de execução (FK-safe):
 *   Nível 0: Assets + AssetAliases
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import 'dotenv/config'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })
import { seedAssets } from './assets'
import { seedAssetAliases } from './assetAliases'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed] ERRO: Seeds não executam em produção.')
    process.exit(1)
  }

  console.log('[seed] Iniciando seeds...\n')

  // ── Nível 0: Base ────────────────────────────────────────────────────────
  await seedAssets()
  await seedAssetAliases()
  console.log('[seed] ✓ Nível 0: Assets (40 clubes) + AssetAliases')

  console.log('[seed] Todos os seeds concluídos!')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
