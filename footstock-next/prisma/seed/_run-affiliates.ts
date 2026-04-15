/**
 * Runner temporário — seed de afiliados a partir do footstock-next.
 * Cria AffiliateCodes para todos os usuários sem código.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const BASE32_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function genCode(name: string): string {
  const prefix = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 5)
    .toUpperCase()
    .padEnd(5, 'X')
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += BASE32_CHARS[Math.floor(Math.random() * BASE32_CHARS.length)]!
  }
  return prefix + suffix
}

async function uniqueCode(prisma: PrismaClient, name: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = genCode(name)
    const taken = await prisma.affiliateCode.findUnique({ where: { code } })
    if (!taken) return code
  }
  let code = 'FS'
  for (let i = 0; i < 7; i++) code += BASE32_CHARS[Math.floor(Math.random() * BASE32_CHARS.length)]!
  return code
}

async function main() {
  const db = process.env.DATABASE_URL!
  const adapter = new PrismaPg({ connectionString: db })
  const prisma = new PrismaClient({ adapter })

  // 1. Promover Lenda para INFLUENCIADOR (corrigir tipo)
  const lenda = await prisma.user.findUnique({ where: { email: 'lenda@foot-stock.test' } })
  if (lenda) {
    await prisma.affiliateCode.upsert({
      where: { userId: lenda.id },
      create: {
        id: 'aff-code-lenda',
        userId: lenda.id,
        code: 'LENDA2026',
        affiliateType: 'INFLUENCIADOR',
        commissionPercentage: 0.10,
        active: true,
      },
      update: { affiliateType: 'INFLUENCIADOR', commissionPercentage: 0.10, active: true },
    })
    console.log('✓ lenda → INFLUENCIADOR')
  }

  // 2. Promover Clube Parceiro para TIME_PARCEIRO
  const clube = await prisma.user.findUnique({ where: { email: 'clube-parceiro@foot-stock.test' } })
  if (clube) {
    await prisma.affiliateCode.upsert({
      where: { userId: clube.id },
      create: {
        id: 'aff-code-clube',
        userId: clube.id,
        code: 'CLUBEFOOT2026',
        affiliateType: 'TIME_PARCEIRO',
        commissionPercentage: 0.05,
        active: true,
      },
      update: { affiliateType: 'TIME_PARCEIRO', commissionPercentage: 0.05, active: true },
    })
    console.log('✓ clube-parceiro → TIME_PARCEIRO')
  }

  // 3. Criar códigos USER para todos os usuários sem código
  const allUsers = await prisma.user.findMany({ select: { id: true, name: true, email: true } })
  let created = 0

  for (const user of allUsers) {
    const existing = await prisma.affiliateCode.findUnique({ where: { userId: user.id } })
    if (existing) continue

    const code = await uniqueCode(prisma, user.name)
    await prisma.affiliateCode.create({
      data: {
        userId: user.id,
        code,
        affiliateType: 'USER',
        commissionPercentage: 0,
        active: true,
      },
    })
    console.log(`  + ${user.email} → ${code} (USER)`)
    created++
  }

  // 4. Resumo
  const total = await prisma.affiliateCode.count()
  const byType = await prisma.affiliateCode.groupBy({ by: ['affiliateType'], _count: true })
  console.log(`\n✓ Total AffiliateCodes: ${total}`)
  for (const r of byType) console.log(`  ${r.affiliateType}: ${r._count}`)
  console.log(`  Criados nesta execução: ${created}`)

  await prisma.$disconnect()
}

main().catch(err => { console.error(err); process.exit(1) })
