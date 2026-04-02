// ============================================================================
// Foot Stock — Integration Tests: Global Teardown
// Limpa todos os dados de teste residuais ao final da suite.
// ============================================================================

import { PrismaClient } from '@prisma/client'

export default async function globalTeardown() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL
  if (!testDatabaseUrl) return

  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })

  try {
    // Remover todos os dados de teste pelo domínio de email de teste
    // Cascade deletes (onDelete: Cascade) removem ordens, posições, transações, etc.
    const deleted = await prisma.user.deleteMany({
      where: { email: { endsWith: '@integration-test.local' } },
    })
    if (deleted.count > 0) {
      console.log(`[integration] ✓ Teardown: ${deleted.count} usuário(s) de teste removido(s)`)
    }

    // Remover posts de fórum de teste (não ligados a usuários de teste)
    await prisma.globalForumPost.deleteMany({
      where: { content: { contains: '[INTEGRATION-TEST]' } },
    })
  } finally {
    await prisma.$disconnect()
  }
}
