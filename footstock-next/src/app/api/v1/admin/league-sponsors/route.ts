// ============================================================================
// Foot Stock — GET /api/v1/admin/league-sponsors
// Lista patrocinadores (modelo Sponsor) para seleção em ligas PRO.
// Retorna somente ativos por padrão; ?all=true retorna todos.
// Fonte: T-017
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const showAll = req.nextUrl.searchParams.get('all') === 'true'

  const sponsors = await prisma.sponsor.findMany({
    where: showAll ? undefined : { isActive: true },
    orderBy: { name: 'asc' },
    select: {
      id:        true,
      name:      true,
      logoUrl:   true,
      isActive:  true,
      createdAt: true,
    },
  })

  return NextResponse.json({ success: true, data: sponsors })
}

export const GET = withAdmin('assets:write')(getHandler)
