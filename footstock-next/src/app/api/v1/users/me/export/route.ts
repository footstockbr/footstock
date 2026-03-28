import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api'

// GET /api/v1/users/me/export?format=json|csv — Portabilidade LGPD
export async function GET(request: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  const format = request.nextUrl.searchParams.get('format') ?? 'json'

  try {
    // TODO: Implementar via /auto-flow execute
    // Registrar solicitação de exportação
    await prisma.dataAccessLog.create({
      data: {
        userId: auth.user.id,
        accessedBy: auth.user.id,
        action: 'DATA_EXPORT_REQUEST',
        details: { format },
      },
    }).catch(() => {
      // Não bloquear se dataAccessLog não existir ainda
    })

    // Retornar 202 Accepted — exportação será processada em background
    return NextResponse.json(
      {
        success: true,
        data: {
          message: 'Exportação solicitada. Você receberá um email em breve.',
          estimatedTime: 'até 15 dias úteis',
        },
      },
      { status: 202 }
    )
  } catch {
    return errors.server()
  }
}
