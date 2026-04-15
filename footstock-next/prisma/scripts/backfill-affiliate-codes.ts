// ============================================================================
// Foot Stock — Backfill: criar AffiliateCode para usuários existentes sem código
//
// Uso: npx tsx prisma/scripts/backfill-affiliate-codes.ts
//
// SEGURANÇA: script read-write em produção. Rode com variável CONFIRM=yes.
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { generateAffiliateCode } from '../../src/lib/utils/affiliate-code-gen'

const prisma = new PrismaClient()

const BASE32_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

function randomBase32(length: number): string {
  let result = ''
  for (let i = 0; i < length; i++) {
    result += BASE32_CHARS[Math.floor(Math.random() * BASE32_CHARS.length)]
  }
  return result
}

async function generateUnique(name: string, taken: Set<string>): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateAffiliateCode(name)
    if (!taken.has(code)) return code
  }
  // Fallback com mais entropia
  const fallback = 'FS' + randomBase32(7)
  if (!taken.has(fallback)) return fallback
  throw new Error(`Não foi possível gerar código único para usuário ${name}`)
}

async function main() {
  if (process.env.CONFIRM !== 'yes') {
    console.error('Execute com CONFIRM=yes para rodar o backfill.')
    console.error('Exemplo: CONFIRM=yes npx tsx prisma/scripts/backfill-affiliate-codes.ts')
    process.exit(1)
  }

  console.log('Iniciando backfill de AffiliateCode para usuários existentes...')

  // Buscar todos os usuários sem AffiliateCode
  const usersWithoutCode = await prisma.user.findMany({
    where: { affiliateCode: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Encontrados ${usersWithoutCode.length} usuários sem código de afiliado.`)

  if (usersWithoutCode.length === 0) {
    console.log('Nada a fazer.')
    return
  }

  // Carregar códigos existentes para evitar colisões
  const existingCodes = await prisma.affiliateCode.findMany({ select: { code: true } })
  const taken = new Set(existingCodes.map((c) => c.code))

  let created = 0
  let failed = 0

  for (const user of usersWithoutCode) {
    try {
      const code = await generateUnique(user.name, taken)
      taken.add(code)

      await prisma.affiliateCode.create({
        data: {
          userId: user.id,
          code,
          affiliateType: 'USER',
          commissionPercentage: 0,
          active: true,
        },
      })

      created++
      if (created % 100 === 0) {
        console.log(`Progresso: ${created}/${usersWithoutCode.length}`)
      }
    } catch (err) {
      console.error(`Falha para usuário ${user.id} (${user.name}):`, err)
      failed++
    }
  }

  console.log(`\nBackfill concluído.`)
  console.log(`  Criados: ${created}`)
  console.log(`  Falhas:  ${failed}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
