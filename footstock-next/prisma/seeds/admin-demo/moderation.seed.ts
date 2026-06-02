/**
 * Seed: Dados de moderação para demonstração
 * Module: module-23-admin-moderacao
 *
 * Cria posts suspeitos e palavras bloqueadas para o painel de moderação
 *
 * GUARD: Não executar em produção
 */

import type { PrismaClient } from '@prisma/client'

const BLOCKED_WORDS = [
  'merda',
  'idiota',
  'burro',
  'lixo',
  'fraude',
  'golpe',
  'cpf',
  'senha',
  'whatsapp',
  'telegram',
  'pix',
  '300%',
  '500%',
  'garantido',
]

const SUSPICIOUS_POSTS = [
  {
    content: 'Esse app é uma merda, perdi tudo por causa de um bug no short selling!!',
    ticker: 'TIM3',
    flagCount: 2,
    daysAgo: 0.17, // 4h atrás
  },
  {
    content: 'Alguém sabe o CPF do admin desse app? Quero contato direto.',
    ticker: 'FOG3',
    flagCount: 3,
    daysAgo: 0.21, // 5h atrás
  },
  {
    content: 'Invista em MAL3 e ganhe 300% em 1 semana. DM para estratégia exclusiva.',
    ticker: 'MAL3',
    flagCount: 4,
    daysAgo: 0.25, // 6h atrás
  },
]

export async function seedAdminDemoModeration(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] Não executar seed de demo em produção!')
  }

  console.log('[seed] Iniciando seed de moderação...')

  // Buscar usuários de demonstração
  const usuarios = await prisma.user.findMany({
    where: {
      email: {
        in: [
          'usuario@foot-stock.dev',
          'craque@foot-stock.dev',
          'lenda@foot-stock.dev',
        ],
      },
    },
    select: { id: true, email: true },
  })

  if (usuarios.length === 0) {
    console.log('[seed] ⚠ Usuários de demo não encontrados — execute users.seed primeiro')
    return
  }

  // Criar posts suspeitos
  let postsCreated = 0
  const now = new Date()

  for (const postData of SUSPICIOUS_POSTS) {
    try {
      const user = usuarios[Math.floor(Math.random() * usuarios.length)]
      const postDate = new Date(now.getTime() - postData.daysAgo * 24 * 60 * 60 * 1000)

      await prisma.globalForumPost.create({
        data: {
          userId: user.id,
          content: postData.content,
          ticker: postData.ticker,
          isFlagged: true,
          flagCount: postData.flagCount,
          isDeleted: false,
          createdAt: postDate,
          updatedAt: postDate,
        },
      })
      console.log(`[seed]   ✓ Post criado: "${postData.content.substring(0, 40)}..."`)
      postsCreated++
    } catch (error) {
      console.log(`[seed]   ~ Erro ao criar post: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Criar palavras bloqueadas
  let wordsCreated = 0
  for (const word of BLOCKED_WORDS) {
    try {
      await prisma.blockedWord.create({
        data: {
          word,
        },
      })
      console.log(`[seed]   ✓ Palavra bloqueada: "${word}"`)
      wordsCreated++
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        console.log(`[seed]   ~ Palavra já existe: "${word}"`)
      } else {
        console.log(`[seed]   ~ Erro ao criar palavra: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  console.log(`[seed] Seed de moderação concluído`)
  console.log(`[seed]   ${postsCreated} posts suspeitos criados`)
  console.log(`[seed]   ${wordsCreated} palavras bloqueadas criadas`)
}
