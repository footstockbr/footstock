// ============================================================================
// Foot Stock — GET/POST /api/v1/admin/affiliates
// Listagem e criação de afiliados. Requer: financial:read (GET) / financial:write (POST).
// RESOLVED: G002 — módulo afiliados implementado conforme FDD RF-PA-011
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

const createSchema = z.object({
  email:                z.string().email('E-mail inválido'),
  affiliateType:        z.enum(['TIME_PARCEIRO', 'INFLUENCIADOR']).default('INFLUENCIADOR'),
  commissionPercentage: z.number().min(0).max(1).default(0.1),
  bankData: z.object({
    banco:    z.string().optional(),
    agencia:  z.string().optional(),
    conta:    z.string().optional(),
    pixKey:   z.string().optional(),
    cnpj:     z.string().optional(),
  }).optional(),
})

export const GET = withAdmin('financial:read')(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const type   = sp.get('type') ?? undefined
  const status = sp.get('status')
  const search = sp.get('search') ?? undefined
  const page   = Math.max(1, parseInt(sp.get('page') ?? '1', 10))
  const limit  = Math.min(50, parseInt(sp.get('limit') ?? '20', 10))

  const where: Prisma.AffiliateCodeWhereInput = {
    ...(type   ? { affiliateType: type as string } : {}),
    ...(status === 'active'   ? { active: true }  : {}),
    ...(status === 'inactive' ? { active: false } : {}),
    ...(search ? {
      OR: [
        { code:         { contains: search, mode: 'insensitive' as const } },
        { user: { name: { contains: search, mode: 'insensitive' as const } } },
      ],
    } : {}),
  }

  const [total, items] = await Promise.all([
    prisma.affiliateCode.count({ where }),
    prisma.affiliateCode.findMany({
      where,
      skip:    (page - 1) * limit,
      take:    limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user:         { select: { name: true, email: true } },
        transactions: { select: { id: true, amount: true, status: true } },
      },
    }),
  ])

  const data = items.map((a: typeof items[number]) => ({
    id:                   a.id,
    code:                 a.code,
    affiliateType:        a.affiliateType,
    active:               a.active,
    commissionPercentage: Number(a.commissionPercentage),
    userName:             a.user.name,
    userEmail:            a.user.email,
    totalConversions:     a.transactions.length,
    totalCommission:      a.transactions.reduce((s: number, t: typeof a.transactions[number]) => s + Number(t.amount), 0),
    pendingCommission:    a.transactions.filter((t: typeof a.transactions[number]) => t.status === 'PENDING').reduce((s: number, t: typeof a.transactions[number]) => s + Number(t.amount), 0),
    createdAt:            a.createdAt,
  }))

  return NextResponse.json({
    data,
    pagination: { page, limit, total, hasNext: page * limit < total },
  })
})

export const POST = withAdmin('financial:write')(async (request: NextRequest) => {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ success: false, error: { code: 'VAL_001', message: 'JSON inválido' } }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: { code: 'VAL_001', message: 'Dados inválidos', details: parsed.error.flatten() } }, { status: 422 })
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() }, select: { id: true } })
  if (!user) {
    return NextResponse.json({ success: false, error: { code: 'AUTH_001', message: 'Usuário não encontrado' } }, { status: 404 })
  }

  const existing = await prisma.affiliateCode.findFirst({ where: { userId: user.id } })
  if (existing) {
    return NextResponse.json({ success: false, error: { code: 'AFF_001', message: 'Usuário já possui código de afiliado' } }, { status: 409 })
  }

  // Gerar código único: prefixo do nome + random
  const baseCode = parsed.data.email.split('@')[0]!.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  const code = `${baseCode}${Math.random().toString(36).slice(2, 6).toUpperCase()}`

  const affiliate = await prisma.affiliateCode.create({
    data: {
      userId:               user.id,
      code,
      affiliateType:        parsed.data.affiliateType as string,
      commissionPercentage: parsed.data.commissionPercentage,
      bankData:             parsed.data.bankData ?? Prisma.JsonNull,
    },
    select: { id: true, code: true, affiliateType: true, commissionPercentage: true, active: true, createdAt: true },
  })

  return NextResponse.json({ success: true, data: affiliate }, { status: 201 })
})
