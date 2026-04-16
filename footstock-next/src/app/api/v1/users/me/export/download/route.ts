// ============================================================================
// FootStock — GET /api/v1/users/me/export/download
// Serve o arquivo ZIP de export gerado pelo DataExportService
// Rastreabilidade: INT-103, US-027, TASK-4/ST001
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'

async function handler(req: NextRequest, { user }: AuthContext) {
  const fileName = req.nextUrl.searchParams.get('file')

  if (!fileName) {
    return NextResponse.json(
      { code: 'LGPD_060', message: 'Parâmetro file obrigatório.' },
      { status: 400 }
    )
  }

  // Sanitize: only allow alphanumeric, hyphens, dots (no path traversal)
  if (!/^export-[\w-]+\.zip$/.test(fileName)) {
    return NextResponse.json(
      { code: 'LGPD_060', message: 'Nome de arquivo inválido.' },
      { status: 400 }
    )
  }

  // Verify the job belongs to this user and is not expired
  const job = await prisma.dataExportJob.findFirst({
    where: {
      userId: user.id,
      status: 'COMPLETED',
      downloadUrl: { contains: fileName },
    },
  })

  if (!job) {
    return NextResponse.json(
      { code: 'LGPD_060', message: 'Export não encontrado ou não pertence a este usuário.' },
      { status: 404 }
    )
  }

  if (job.expiresAt && job.expiresAt < new Date()) {
    return NextResponse.json(
      { code: 'LGPD_060', message: 'Link de download expirado. Solicite novo export.' },
      { status: 410 }
    )
  }

  const filePath = path.join(os.tmpdir(), 'footstock-exports', fileName)

  try {
    const buffer = await fs.readFile(filePath)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json(
      { code: 'LGPD_061', message: 'Arquivo de export não encontrado no servidor. Solicite novo export.' },
      { status: 404 }
    )
  }
}

export const GET = withAuth(handler as never)
