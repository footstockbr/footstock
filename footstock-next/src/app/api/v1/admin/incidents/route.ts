import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'
import { IncidentNotificationService } from '@/lib/services/IncidentNotificationService'

// Persistimos no modelo REAL `IncidentLog` (tabela incident_logs). Antes o código
// chamava `prisma.securityIncident` (modelo inexistente): o optional-chaining
// curto-circuitava, `incident` ficava undefined e a rota retornava 200 com um
// incidente NUNCA gravado — perda silenciosa de trilha de auditoria (LGPD).
const IncidentSchema = z.object({
  type: z.string().min(2).max(80),
  description: z.string().min(10).max(2000),
  detectedAt: z.string().datetime({ message: 'detectedAt deve ser ISO 8601.' }),
  affectedUsers: z.number().int().min(0).optional(),
  dataTypes: z.array(z.string().max(80)).max(50).optional(),
  estimatedImpact: z.string().max(500).optional(),
  report: z.string().max(5000).optional(),
})

/** POST /api/v1/admin/incidents — Registrar incidente de segurança */
export async function POST(request: Request) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const user = auth.user

  if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(user.adminRole ?? '')) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = IncidentSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors },
      { status: 422 }
    )
  }
  const { type, description, detectedAt, affectedUsers, dataTypes, estimatedImpact, report } =
    parsed.data

  const detectedAtDate = new Date(detectedAt)
  const anpdDeadline = IncidentNotificationService.calculateAnpdDeadline(detectedAtDate)
  const isUrgent = IncidentNotificationService.isDeadlineUrgent(anpdDeadline)

  try {
    const incident = await prisma.incidentLog.create({
      data: {
        type,
        description,
        detectedAt: detectedAtDate,
        affectedUsers: affectedUsers ?? 0,
        dataTypes: dataTypes ?? [],
        estimatedImpact: estimatedImpact ?? 'A avaliar',
        report: report ?? description,
        emailSent: false,
      },
    })

    return NextResponse.json({
      success: true,
      incident: {
        id: incident.id,
        type: incident.type,
        description: incident.description,
        detectedAt: incident.detectedAt.toISOString(),
        anpdDeadline,
        isUrgent,
        hoursRemaining: IncidentNotificationService.hoursRemaining(anpdDeadline),
      },
      warning: isUrgent ? 'URGENTE: Prazo ANPD em menos de 24h' : undefined,
    })
  } catch (error) {
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
    const incidents = await prisma.incidentLog.findMany({
      orderBy: { detectedAt: 'desc' },
    })
    return NextResponse.json({ incidents })
  } catch (error) {
    console.error('[Incidents] Erro ao buscar:', error)
    return NextResponse.json({ error: 'Erro ao buscar incidentes' }, { status: 500 })
  }
}
