import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, created, list, errors, error, parsePagination, buildPagination } from '@/lib/api'
import type { PostStatus } from '@/types'

// Zod valida apenas tipo e presença do campo; os limites de tamanho (min/max)
// são validados explicitamente abaixo para garantir os códigos FORUM_021 e
// FORUM_050 — sem que o VAL_001 genérico os torne inalcançáveis.
const CreateForumPostSchema = z.object({
  content: z.string({ message: 'Conteúdo é obrigatório.' }),
  ticker: z.string().max(10).optional(),
})

// Padrão de sanitização: remove CPF, CNPJ, telefone, e-mail, URLs
const BLOCKED_PATTERNS = [
  /\b\d{3}[.\-]?\d{3}[.\-]?\d{3}[-.]?\d{2}\b/, // CPF
  /\b\d{2}[.\-]?\d{3}[.\-]?\d{3}[/]?\d{4}[-.]?\d{2}\b/, // CNPJ
  /\(\d{2}\)\s?\d{4,5}[-.]?\d{4}/, // telefone
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/, // e-mail
  /https?:\/\/[^\s]+/, // URLs
]

function sanitizeContent(content: string): { clean: string; flagged: boolean } {
  let flagged = false
  let clean = content

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(clean)) {
      flagged = true
      clean = clean.replace(pattern, '[removido]')
    }
  }

  return { clean, flagged }
}

function serializePost(p: {
  id: string; userId: string; content: string; ticker: string | null
  status: string; likes: number; flagged: boolean; createdAt: Date; updatedAt: Date
}) {
  return {
    id: p.id,
    userId: p.userId,
    content: p.content,
    ticker: p.ticker ?? null,
    status: p.status as PostStatus,
    likes: p.likes,
    flagged: p.flagged,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

// GET /api/v1/forum
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const { searchParams } = request.nextUrl
  const ticker = searchParams.get('ticker')
  const sort = searchParams.get('sort') ?? 'recentes'
  const { page, limit, skip } = parsePagination(searchParams, 20)

  try {
    const where = {
      status: 'ACTIVE' as PostStatus,
      ...(ticker && { ticker: ticker.toUpperCase() }),
    }

    const orderBy = sort === 'curtidos'
      ? { likes: 'desc' as const }
      : { createdAt: 'desc' as const }

    const [posts, total] = await Promise.all([
      prisma.forumPost.findMany({
        where,
        orderBy,
        skip,
        take: Math.min(limit, 50),
      }),
      prisma.forumPost.count({ where }),
    ])

    return list(posts.map(serializePost), buildPagination(page, Math.min(limit, 50), total))
  } catch {
    return errors.server()
  }
}

// POST /api/v1/forum
export async function POST(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const body = await request.json()
    const parsed = CreateForumPostSchema.safeParse(body)

    if (!parsed.success) {
      return errors.validation()
    }

    const { content, ticker } = parsed.data

    // Validar vazio — FORUM_021
    if (content.trim().length === 0) {
      return error('FORUM_021', 'Conteúdo não pode ser vazio.', 422)
    }

    // Validar limite de caracteres — FORUM_050
    if (content.length > 280) {
      return error('FORUM_050', `${content.length}/280 caracteres — limite excedido.`, 422)
    }

    const { clean, flagged } = sanitizeContent(content)

    const post = await prisma.forumPost.create({
      data: {
        userId: auth.user.id,
        content: clean,
        ticker: ticker?.toUpperCase() ?? null,
        flagged,
        status: flagged ? 'FLAGGED' : 'ACTIVE',
      },
    })

    return created(serializePost(post))
  } catch {
    return errors.server()
  }
}
