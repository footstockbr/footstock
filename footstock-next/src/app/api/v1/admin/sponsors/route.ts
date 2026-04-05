// ============================================================================
// Foot Stock — GET /api/v1/admin/sponsors  (lista todos)
//             POST /api/v1/admin/sponsors  (cria patrocinador)
// Fonte: module-24/TASK-3/ST002
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { BANNER_POSITIONS } from '@/lib/types/sponsors'
import { adminAuditService } from '@/lib/services/shared'

// ---------------------------------------------------------------------------
// Schema de criação
// ---------------------------------------------------------------------------

const BannerEntrySchema = z.object({
  imageUrl: z.string().url(),
  linkUrl: z.string().url(),
  altText: z.string().min(1).max(200),
})

const CreateSponsorSchema = z.object({
  name: z.string().min(2).max(100),
  logo: z.string().url().optional(),
  banners: z.record(z.string(), BannerEntrySchema).default({}),
  activeLigaId: z.string().cuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  active: z.boolean().default(false),
})

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

async function getHandler(): Promise<NextResponse> {
  const sponsors = await prisma.adSponsor.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ success: true, data: sponsors })
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

async function postHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }

  const parsed = CreateSponsorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' },
      { status: 422 }
    )
  }

  const data = parsed.data

  if (new Date(data.startsAt) >= new Date(data.endsAt)) {
    return NextResponse.json(
      { success: false, error: 'startsAt deve ser anterior a endsAt.' },
      { status: 422 }
    )
  }

  const sponsor = await prisma.adSponsor.create({
    data: {
      name: data.name,
      logo: data.logo ?? null,
      banners: data.banners,
      activeLigaId: data.activeLigaId ?? null,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      active: data.active,
    },
  })

  // Invalidar cache Redis para posições cobertas
  if (data.active) {
    await invalidateBannerCache(Object.keys(data.banners))
  }

  await adminAuditService.log({
    adminId: user.id,
    action: 'SPONSOR_CREATE',
    details: { sponsorId: sponsor.id, sponsorName: sponsor.name },
  })

  return NextResponse.json({ success: true, data: sponsor }, { status: 201 })
}

// ---------------------------------------------------------------------------
// Helper: invalidar cache de banners
// ---------------------------------------------------------------------------

async function invalidateBannerCache(positions: string[]): Promise<void> {
  try {
    await Promise.all(positions.map(p => redis.del(`banner:active:${p}`)))
  } catch {
    // Ignorar falha de cache
  }
}

export const GET = withAdmin('assets:write')(getHandler)
export const POST = withAdmin('assets:write')(postHandler)
