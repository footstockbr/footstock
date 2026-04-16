import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { BANNER_POSITIONS } from '@/lib/types/sponsors'
import type { User, AdminRole } from '@/types'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

const bannerCreateSchema = z.object({
  title: z.string().min(1, 'Título obrigatório'),
  company: z.string().min(1, 'Empresa obrigatória'),
  position: z.enum(BANNER_POSITIONS),
  isActive: z.boolean().optional().default(true),
  color: z.string().regex(HEX_COLOR, 'Cor inválida (use #RRGGBB)').optional().default('#00B1EA'),
  ctaText: z.string().min(1, 'Texto do CTA obrigatório'),
  ctaColor: z.string().regex(HEX_COLOR, 'Cor CTA inválida (use #RRGGBB)').optional().default('#00B1EA'),
  linkUrl: z.string().url('URL de destino inválida').optional().nullable(),
  // Campos T-017: banner com imagem e vinculo a patrocinador
  imageUrl:  z.string().url('imageUrl inválida').optional().nullable(),
  sponsorId: z.string().cuid('sponsorId inválido').optional().nullable(),
  width:     z.number().int().positive().optional().nullable(),
  height:    z.number().int().positive().optional().nullable(),
  // Campos de data e imagens responsivas
  startDate:       z.string().datetime({ offset: true }).optional().nullable(),
  endDate:         z.string().datetime({ offset: true }).optional().nullable(),
  imageDesktopUrl:  z.string().url('imageDesktopUrl inválida').optional().nullable(),
  imageMobileUrl:   z.string().url('imageMobileUrl inválida').optional().nullable(),
  imageVerticalUrl: z.string().url('imageVerticalUrl inválida').optional().nullable(),
})

export async function GET(request: NextRequest) {
  let auth = await getAuthUser()

  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser: User = {
        id: 'dev-user',
        email: 'dev@foot-stock.test',
        name: 'Dev User',
        phone: null,
        birthDate: '',
        favoriteClub: '',
        favoriteClubDisplayName: null,
        userType: 'NORMAL',
        investorProfile: 'INICIANTE',
        planType: 'JOGADOR',
        fsBalance: 0,
        marginBlocked: 0,
        tourCompleted: false,
        ageVerificationPending: false,
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-052', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const banners = await prisma.sponsorBanner.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return ok(banners)
  } catch (error) {
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}

export async function POST(request: NextRequest) {
  let auth = await getAuthUser()

  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser: User = {
        id: 'dev-user',
        email: 'dev@foot-stock.test',
        name: 'Dev User',
        phone: null,
        birthDate: '',
        favoriteClub: '',
        favoriteClubDisplayName: null,
        userType: 'NORMAL',
        investorProfile: 'INICIANTE',
        planType: 'JOGADOR',
        fsBalance: 0,
        marginBlocked: 0,
        tourCompleted: false,
        ageVerificationPending: false,
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-052', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const parsed = bannerCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VAL_001', message: 'Dados inválidos', fieldErrors: parsed.error.flatten().fieldErrors } },
        { status: 422 }
      )
    }
    const { title, company, position, isActive, color, ctaText, ctaColor, linkUrl, imageUrl, sponsorId, width, height, startDate, endDate, imageDesktopUrl, imageMobileUrl, imageVerticalUrl } = parsed.data

    const banner = await prisma.sponsorBanner.create({
      data: {
        title, company, position, isActive, color, ctaText, ctaColor,
        linkUrl:          linkUrl          ?? null,
        imageUrl:         imageUrl         ?? null,
        sponsorId:        sponsorId        ?? null,
        width:            width            ?? null,
        height:           height           ?? null,
        startDate:        startDate ? new Date(startDate) : null,
        endDate:          endDate   ? new Date(endDate)   : null,
        imageDesktopUrl:  imageDesktopUrl  ?? null,
        imageMobileUrl:   imageMobileUrl   ?? null,
        imageVerticalUrl: imageVerticalUrl ?? null,
      },
    })

    return ok(banner, 201)
  } catch (error) {
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}
