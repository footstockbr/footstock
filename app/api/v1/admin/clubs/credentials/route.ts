import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

/** POST /api/v1/admin/clubs/credentials — Criar credencial de clube */
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const admin = auth.user

  if (admin.adminRole !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Apenas SuperAdmin pode gerenciar credenciais' }, { status: 403 })
  }

  const { clubId, email, password } = await request.json()
  if (!clubId || !email || !password) {
    return NextResponse.json({ error: 'clubId, email e password são obrigatórios' }, { status: 400 })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credential = await (prisma as any).clubCredential?.create({
      data: { clubId, email, passwordHash, createdBy: admin.id, active: true },
    })

    return NextResponse.json({ success: true, id: credential?.id ?? 'created' }, { status: 201 })
  } catch (error) {
    console.error('[ClubCredentials POST]', error)
    return NextResponse.json({ error: 'Erro ao criar credencial' }, { status: 500 })
  }
}

/** GET /api/v1/admin/clubs/credentials — Listar credenciais (sem password) */
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (auth.user.adminRole !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const credentials = await (prisma as any).clubCredential?.findMany({
      select: { id: true, clubId: true, email: true, active: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }) ?? []

    return NextResponse.json({ credentials })
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar credenciais' }, { status: 500 })
  }
}
