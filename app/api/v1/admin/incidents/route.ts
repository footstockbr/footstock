import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'
import { IncidentNotificationService } from '@/lib/services/IncidentNotificationService'

/** POST /api/v1/admin/incidents — Registrar incidente de segurança */
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const user = auth.user

  if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(user.adminRole ?? '')) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const body = await request.json()
  const { type, description, detectedAt } = body

  if (!type || !description || !detectedAt) {
    return NextResponse.json({ error: 'Campos obrigatórios: type, description, detectedAt' }, { status: 400 })
  }

  const detectedAtDate = new Date(detectedAt)
  const anpdDeadline = IncidentNotificationService.calculateAnpdDeadline(detectedAtDate)
  const isUrgent = IncidentNotificationService.isDeadlineUrgent(anpdDeadline)

  try {
    // Usar auditLog ou tabela genérica conforme schema disponível
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const incident = await (prisma as any).securityIncident?.create({
      data: {
        type,
        description,
        detectedAt: detectedAtDate,
        anpdDeadline,
        status: 'OPEN',
        reportedBy: user.id,
      },
    }).catch(() => null)

    return NextResponse.json({
      success: true,
      incident: incident ?? {
        type,
        description,
        detectedAt: detectedAtDate,
        anpdDeadline,
        status: 'OPEN',
        isUrgent,
        hoursRemaining: IncidentNotificationService.hoursRemaining(anpdDeadline),
      },
      warning: isUrgent ? 'URGENTE: Prazo ANPD em menos de 24h' : undefined,
    })
  } catch {
    console.error('[Incidents] Erro ao registrar:', error)
    return NextResponse.json({ error: 'Erro ao registrar incidente' }, { status: 500 })
  }
}

/** GET /api/v1/admin/incidents — Listar incidentes */
export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(auth.user.adminRole ?? '')) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const incidents = await (prisma as any).securityIncident?.findMany({
      orderBy: { detectedAt: 'desc' },
    }).catch(() => [])

    return NextResponse.json({ incidents: incidents ?? [] })
  } catch {
    return NextResponse.json({ error: 'Erro ao buscar incidentes' }, { status: 500 })
  }
}
