// ============================================================================
// FootStock — PUT  /api/v1/admin/sponsors/[id]  (atualiza patrocinador)
//             DELETE /api/v1/admin/sponsors/[id]  (remove patrocinador)
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
// Schema de atualização (todos os campos opcionais)
// ---------------------------------------------------------------------------

const BannerEntrySchema = z.object({
  imageUrl: z.string().url(),
  linkUrl: z.string().url(),
  altText: z.string().min(1).max(200),
})

const UpdateSponsorSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  logo: z.string().url().nullable().optional(),
  banners: z.record(z.enum(BANNER_POSITIONS), BannerEntrySchema).optional(),
  activeLigaId: z.string().cuid().nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  active: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// Helper: extrair ID da URL
// ---------------------------------------------------------------------------

function extractId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  return segments[segments.length - 1] ?? ''
}

// ---------------------------------------------------------------------------
// Helper: invalidar cache Redis por posições
// ---------------------------------------------------------------------------

async function invalidateBannerCache(positions: string[]): Promise<void> {
  try {
    await Promise.all(positions.map(p => redis.del(`banner:active:${p}`)))
  } catch {
    // Ignorar falha de cache
  }
}

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

async function putHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const id = extractId(req)
  if (!id) {
    return NextResponse.json({ success: false, error: 'ID inválido.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }

  const parsed = UpdateSponsorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' },
      { status: 422 }
    )
  }

  const existing = await prisma.adSponsor.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Patrocinador não encontrado.' }, { status: 404 })
  }

  const data = parsed.data

  if (data.startsAt && data.endsAt && new Date(data.startsAt) >= new Date(data.endsAt)) {
    return NextResponse.json(
      { success: false, error: 'startsAt deve ser anterior a endsAt.' },
      { status: 422 }
    )
  }

  const updated = await prisma.adSponsor.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.logo !== undefined && { logo: data.logo }),
      ...(data.banners !== undefined && { banners: data.banners }),
      ...(data.activeLigaId !== undefined && { activeLigaId: data.activeLigaId }),
      ...(data.startsAt !== undefined && { startsAt: new Date(data.startsAt) }),
      ...(data.endsAt !== undefined && { endsAt: new Date(data.endsAt) }),
      ...(data.active !== undefined && { active: data.active }),
    },
  })

  // Invalidar cache Redis
  const allPositions = [
    ...Object.keys(existing.banners as object),
    ...Object.keys(data.banners ?? {}),
  ]
  await invalidateBannerCache(allPositions)

  await adminAuditService.log({
    adminId: user.id,
    action: 'SPONSOR_UPDATE',
    details: { sponsorId: id, updatedFields: Object.keys(data) },
  })

  return NextResponse.json({ success: true, data: updated })
}

// ---------------------------------------------------------------------------
// DELETE (soft delete — marca active=false)
// ---------------------------------------------------------------------------

async function deleteHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const id = extractId(req)
  if (!id) {
    return NextResponse.json({ success: false, error: 'ID inválido.' }, { status: 400 })
  }

  const existing = await prisma.adSponsor.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Patrocinador não encontrado.' }, { status: 404 })
  }

  await prisma.adSponsor.update({
    where: { id },
    data: { active: false },
  })

  // Invalidar cache das posições do sponsor desativado
  await invalidateBannerCache(Object.keys(existing.banners as object))

  await adminAuditService.log({
    adminId: user.id,
    action: 'SPONSOR_DELETE',
    details: { sponsorId: id, sponsorName: existing.name },
  })

  return NextResponse.json({ success: true, data: { id, active: false } })
}

export const PUT = withAdmin('assets:write')(putHandler)
export const DELETE = withAdmin('assets:write')(deleteHandler)
