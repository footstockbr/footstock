import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { BANNER_POSITIONS } from '@/lib/types/sponsors'
import type { User, AdminRole } from '@/types'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

const bannerUpdateSchema = z.object({
  title: z.string().min(1, 'Título não pode ser vazio').optional(),
  company: z.string().min(1, 'Empresa não pode ser vazia').optional(),
  position: z.enum(BANNER_POSITIONS).optional(),
  isActive: z.boolean().optional(),
  color: z.string().regex(HEX_COLOR, 'Cor inválida (use #RRGGBB)').optional(),
  ctaText: z.string().min(1, 'Texto do CTA não pode ser vazio').optional(),
  ctaColor: z.string().regex(HEX_COLOR, 'Cor CTA inválida (use #RRGGBB)').optional(),
  linkUrl: z.string().url('URL de destino inválida').nullish(),
  // Campos T-017
  imageUrl:  z.string().url('imageUrl inválida').nullish(),
  sponsorId: z.string().cuid('sponsorId inválido').nullish(),
  width:     z.number().int().positive().nullish(),
  height:    z.number().int().positive().nullish(),
  // Campos de data e imagens responsivas
  startDate:        z.string().datetime({ offset: true }).nullish(),
  endDate:          z.string().datetime({ offset: true }).nullish(),
  imageDesktopUrl:  z.string().url('imageDesktopUrl inválida').nullish(),
  imageMobileUrl:   z.string().url('imageMobileUrl inválida').nullish(),
  imageVerticalUrl: z.string().url('imageVerticalUrl inválida').nullish(),
})

interface BannerParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: BannerParams) {
  const { id } = await params
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
      auth = { user: dummyUser, userId: 'dev-user' }
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
    const parsed = bannerUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VAL_001', message: 'Dados inválidos', fieldErrors: parsed.error.flatten().fieldErrors } },
        { status: 422 }
      )
    }
    const { title, company, position, isActive, color, ctaText, ctaColor, linkUrl, imageUrl, sponsorId, width, height, startDate, endDate, imageDesktopUrl, imageMobileUrl, imageVerticalUrl } = parsed.data
    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (company !== undefined) updateData.company = company
    if (position !== undefined) updateData.position = position
    if (isActive !== undefined) updateData.isActive = isActive
    if (color !== undefined) updateData.color = color
    if (ctaText !== undefined) updateData.ctaText = ctaText
    if (ctaColor !== undefined) updateData.ctaColor = ctaColor
    if (linkUrl !== undefined) updateData.linkUrl = linkUrl ?? null
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl ?? null
    if (sponsorId !== undefined) updateData.sponsorId = sponsorId ?? null
    if (width !== undefined) updateData.width = width ?? null
    if (height !== undefined) updateData.height = height ?? null
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null
    if (imageDesktopUrl !== undefined) updateData.imageDesktopUrl = imageDesktopUrl ?? null
    if (imageMobileUrl !== undefined) updateData.imageMobileUrl = imageMobileUrl ?? null
    if (imageVerticalUrl !== undefined) updateData.imageVerticalUrl = imageVerticalUrl ?? null

    const banner = await prisma.sponsorBanner.update({
      where: { id },
      data: updateData,
    })

    return ok(banner)
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'SPONSOR-001', message: 'Banner não encontrado' } },
        { status: 404 }
      )
    }
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}

export async function DELETE(request: NextRequest, { params }: BannerParams) {
  const { id } = await params
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
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-052', message: 'Apenas super admin pode deletar.' } },
      { status: 403 }
    )
  }

  try {
    await prisma.sponsorBanner.delete({
      where: { id },
    })
    return ok({ message: 'Banner deletado com sucesso' })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'SPONSOR-001', message: 'Banner não encontrado' } },
        { status: 404 }
      )
    }
    console.error('[sponsors] Error:', error)
    return errors.server()
  }
}
