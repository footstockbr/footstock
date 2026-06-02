// ============================================================================
// FootStock — Seed: Dados de demonstração de moderação
// Popula blacklist com 5 palavras de demo.
// Idempotente (upsert por palavra).
// Uso: npx tsx prisma/seed/moderation-demo.ts
// Fonte: module-24/TASK-4/ST002
// ============================================================================

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_WORDS = ['palavrao', 'spam', 'golpe', 'fraude', 'esquema']

async function seedModerationDemo(): Promise<void> {
  let created = 0
  let existing = 0

  for (const word of DEMO_WORDS) {
    const result = await prisma.blockedWord.upsert({
      where: { word },
      create: { word },
      update: {}, // Não atualizar se já existe
    })
    if (result.id) existing++
    else created++
  }

  console.log(`✅ Blacklist de demo populada:`)
  console.log(`   Palavras processadas: ${DEMO_WORDS.length}`)
  console.log(`   Palavras: ${DEMO_WORDS.join(', ')}`)
  console.log()
  console.log('ℹ️  Nota: Para posts flagrados de demo, crie manualmente via painel admin')
  console.log('   ou use o fórum com as palavras acima para disparar o auto-flag.')
}

seedModerationDemo()
  .catch(e => {
    console.error('❌ Erro ao popular blacklist de demo:', e)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
