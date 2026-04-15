/**
 * Runner temporário — executa apenas seedAffiliates().
 * Uso: ts-node --project tsconfig.seed.json -r tsconfig-paths/register prisma/seed/_run-affiliates-only.ts
 */
import { prisma } from '@/lib/prisma'
import { seedAffiliates } from './affiliates'

async function main() {
  await seedAffiliates()
  console.log('[runner] Seed de afiliados concluído.')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
