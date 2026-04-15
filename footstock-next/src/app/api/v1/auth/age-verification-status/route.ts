// T-023: Endpoint para o usuário consultar status da verificação de maioridade
// GET /api/v1/auth/age-verification-status
// Retorna status atual e histórico de verificações

import { NextRequest, NextResponse } from 'next/server'
import { withAuth, type AuthContext } from '@/app/api/middleware'

import { prisma } from '@/lib/prisma'

async function handler(_req: NextRequest, { user }: AuthContext) {
  const verifications = await prisma.ageVerification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      isAdult: true,
      method: true,
      verifiedAt: true,
      createdAt: true,
    },
  })

  return NextResponse.json({
    success: true,
    data: {
      pending: user.ageVerificationPending,
      verified: !user.ageVerificationPending,
      history: verifications,
    },
  })
}

export const GET = withAuth(handler)
