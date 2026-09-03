// ============================================================================
// FootStock — Integration Tests: Global Teardown
// Limpa todos os dados de teste residuais ao final da suite.
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { limparUsuariosDeTeste } from './helpers/cleanup.helper'

export default async function globalTeardown() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL
  if (!testDatabaseUrl) return

  // Prisma 7: conexao vem do driver adapter, nao de `datasources` (ver globalSetup).
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
  })

  try {
    // Remover todos os dados de teste pelo domínio de email de teste.
    //
    // O comentario que estava aqui afirmava que "cascade deletes removem ordens,
    // posicoes, transacoes, etc" -- nao removem: dos 33 FKs que apontam para
    // `users`, 15 sao NO ACTION, e `orders` e um deles. O delete nu so nunca
    // estourou porque a factory de ordens estava quebrada e nenhuma linha filha
    // chegava a nascer. A cascata e feita em codigo, pelo helper compartilhado.
    const removidos = await limparUsuariosDeTeste(prisma, '@integration-test.local')
    if (removidos > 0) {
      console.log(`[integration] ✓ Teardown: ${removidos} usuário(s) de teste removido(s)`)
    }

    // Remover posts de fórum de teste (não ligados a usuários de teste)
    await prisma.globalForumPost.deleteMany({
      where: { content: { contains: '[INTEGRATION-TEST]' } },
    })
  } finally {
    await prisma.$disconnect()
  }
}
