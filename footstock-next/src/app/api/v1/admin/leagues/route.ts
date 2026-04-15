// ============================================================================
// Foot Stock — POST /api/v1/admin/leagues
// Criação de ligas PRO pelo admin. Usuários comuns NÃO podem criar ligas PRO.
// Fonte: T-017
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { adminAuditService } from '@/lib/services/shared'

const CreateProLeagueSchema = z.object({
  name:               z.string().min(2).max(100),
  description:        z.string().max(500).optional(),
  startsAt:           z.string().datetime(),
  endsAt:             z.string().datetime(),
  sponsorId:          z.string().cuid().optional(),
  permiteAlavancagem: z.boolean().default(false),
  bannerId:           z.string().cuid().optional(),
})

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

async function postHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Body inválido.' }, { status: 400 })
  }

  const parsed = CreateProLeagueSchema.safeParse(body)
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

  // Validar patrocinador ativo se fornecido
  if (data.sponsorId) {
    const sponsor = await prisma.sponsor.findUnique({
      where: { id: data.sponsorId },
      select: { id: true, isActive: true },
    })
    if (!sponsor) {
      return NextResponse.json(
        { success: false, error: 'Patrocinador não encontrado.' },
        { status: 404 }
      )
    }
    if (!sponsor.isActive) {
      return NextResponse.json(
        { success: false, error: 'Patrocinador inativo. Ative o patrocinador antes de vincular.' },
        { status: 422 }
      )
    }
  }

  // Validar banner ativo se fornecido
  if (data.bannerId) {
    const banner = await prisma.sponsorBanner.findUnique({
      where: { id: data.bannerId },
      select: { id: true, isActive: true },
    })
    if (!banner) {
      return NextResponse.json(
        { success: false, error: 'Banner não encontrado.' },
        { status: 404 }
      )
    }
    if (!banner.isActive) {
      return NextResponse.json(
        { success: false, error: 'Banner inativo. Ative o banner antes de vincular.' },
        { status: 422 }
      )
    }
  }

  const slug = `${slugify(data.name)}-${Date.now().toString(36)}`

  const league = await prisma.league.create({
    data: {
      name:               data.name,
      slug,
      type:               'PRO',
      division:           'OPEN',
      duration:           'TEMPORADA',
      maxMembers:         0, // sem limite de membros em liga PRO
      startsAt:           new Date(data.startsAt),
      endsAt:             new Date(data.endsAt),
      createdBy:          user.id,
      sponsorId:          data.sponsorId ?? null,
      bannerId:           data.bannerId ?? null,
      permiteAlavancagem: data.permiteAlavancagem,
      status:             'ACTIVE',
    },
    include: {
      sponsor: { select: { id: true, name: true } },
      banner:  { select: { id: true, position: true, imageUrl: true } },
    },
  })

  await adminAuditService.log({
    adminId: user.id,
    action:  'LEAGUE_PRO_CREATE',
    details: {
      leagueId:           league.id,
      leagueName:         league.name,
      sponsorId:          data.sponsorId ?? null,
      permiteAlavancagem: data.permiteAlavancagem,
    },
  })

  return NextResponse.json({ success: true, data: league }, { status: 201 })
}

export const POST = withAdmin('assets:write')(postHandler)
